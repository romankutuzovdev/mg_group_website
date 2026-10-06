"""Same-origin image proxy for auction CDNs.

BY visitors often cannot reach Copart/IAAI/Encar without a VPN. The browser
loads `/api/lot-image?u=...` (Vercel → Windows), and Windows fetches the CDN
with outbound access. Responses are cached on disk so repeat views are fast.
Prefer archived `/api/lot-photos/...` when the lot already has them.
"""

from __future__ import annotations

import hashlib
import re
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

from app.services.lot_photos import photos_root, resolve_photo_file

router = APIRouter(tags=["lot-image"])

_ALLOWED = re.compile(
    r"("
    r"^(?:cs|c-static)\.copart\.(?:com|co\.uk)$|"
    r"(?:^|\.)iaai\.com$|"
    r"(?:^|\.)anvisimages\.com$|"
    r"(?:^|\.)encar\.com$|"
    r"(?:^|\.)bid\.cars$|"
    r"(?:^|\.)autoimg\.cn$|"
    r"(?:^|\.)che168\.com$|"
    r"(?:^|\.)autohome\.com$|"
    r"(?:^|\.)autohome\.com\.cn$|"
    r"(?:^|\.)cloudfront\.net$|"
    r"(?:^|\.)amazonaws\.com$"
    r")",
    re.I,
)

_JUNK = re.compile(
    r"\.svg(?:$|\?)|/content/[a-z]{2}\.svg|www\.copart\.(?:com|co\.uk)/content/"
    r"|https?://(?:www\.)?copart\.(?:com|co\.uk)/?(?:$|\?)"
    r"|\bflag\b|/logo|sprite|1x1|pixel|blank\.",
    re.I,
)

# Disk cache for proxied CDN bytes (shared across visitors).
_CACHE_TTL_SEC = 7 * 24 * 3600
_CACHE_MAX_FILES = 8000


def _referer_for(host: str, url: str) -> str:
    h = host.lower()
    # UK files live on cs.copart.com, so the host alone is not enough.
    # Callers retry the other Copart origin when the first referer is rejected.
    if "copart.co.uk" in h or "copart.co.uk" in url.lower():
        return "https://www.copart.co.uk/"
    if "copart" in h:
        return "https://www.copart.com/"
    if "iaai" in h or "anvis" in h:
        return "https://www.iaai.com/"
    if "encar" in h:
        return "https://www.encar.com/"
    if "autoimg" in h or "che168" in h or "autohome" in h:
        return "https://global.autohome.com/"
    if "bid.cars" in h:
        return "https://bid.cars/"
    return f"https://{host}/"


def _proxy_cache_dir() -> Path:
    root = photos_root() / "_proxy-cache"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _cache_key(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def _cache_paths(url: str) -> tuple[Path, Path]:
    key = _cache_key(url)
    folder = _proxy_cache_dir() / key[:2]
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{key}.bin", folder / f"{key}.meta"


def _read_cache(url: str) -> tuple[bytes, str] | None:
    bin_path, meta_path = _cache_paths(url)
    if not bin_path.is_file() or not meta_path.is_file():
        return None
    try:
        age = time.time() - bin_path.stat().st_mtime
        if age > _CACHE_TTL_SEC:
            return None
        ctype = meta_path.read_text(encoding="utf-8").strip() or "image/jpeg"
        data = bin_path.read_bytes()
        if len(data) < 600:
            return None
        return data, ctype
    except OSError:
        return None


def _write_cache(url: str, data: bytes, ctype: str) -> None:
    if len(data) < 600:
        return
    bin_path, meta_path = _cache_paths(url)
    try:
        bin_path.write_bytes(data)
        meta_path.write_text((ctype or "image/jpeg").split(";")[0].strip(), encoding="utf-8")
    except OSError:
        return
    # Opportunistic prune when cache grows too large
    try:
        root = _proxy_cache_dir()
        files = sorted(root.rglob("*.bin"), key=lambda p: p.stat().st_mtime)
        overflow = len(files) - _CACHE_MAX_FILES
        if overflow > 0:
            for stale in files[:overflow]:
                stale.unlink(missing_ok=True)
                meta = stale.with_suffix(".meta")
                meta.unlink(missing_ok=True)
    except OSError:
        pass


def _shrink_iaai_url(url: str, max_width: int = 640) -> str:
    """Cap IAAI resizer size so proxy downloads stay small for catalog cards."""
    try:
        parsed = urlparse(url)
    except Exception:
        return url
    if "vis.iaai.com" not in (parsed.hostname or "").lower():
        return url
    qs = dict(parse_qsl(parsed.query, keep_blank_values=True))
    try:
        w = int(qs.get("width") or "0")
    except ValueError:
        w = 0
    if w and w <= max_width:
        return url
    qs["width"] = str(max_width)
    if "height" in qs:
        try:
            h = int(qs.get("height") or "0")
            if w > 0 and h > 0:
                qs["height"] = str(max(1, int(h * max_width / w)))
            else:
                qs["height"] = str(int(max_width * 0.75))
        except ValueError:
            qs["height"] = str(int(max_width * 0.75))
    else:
        qs["height"] = str(int(max_width * 0.75))
    return urlunparse(parsed._replace(query=urlencode(qs)))


def _prefer_copart_thumb(url: str) -> str:
    if re.search(r"(?:c-static|cs)\.copart\.(?:com|co\.uk)", url, re.I):
        return re.sub(r"_(?:ful|hrs)\.", "_thb.", url, flags=re.I)
    return url


@router.get("/api/lot-image")
async def proxy_lot_image(u: str = Query(..., min_length=8)) -> Response:
    target = (u or "").strip()
    try:
        parsed = urlparse(target)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Bad URL") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Bad URL")
    if _JUNK.search(target):
        raise HTTPException(status_code=404, detail="Not a lot photo")
    host = parsed.hostname
    if not _ALLOWED.search(host):
        raise HTTPException(status_code=403, detail="Host not allowed")

    # Prefer smaller variants before hitting CDN (catalog cards).
    original = _shrink_iaai_url(target)
    target = _prefer_copart_thumb(original)

    cached = _read_cache(target)
    if cached:
        data, ctype = cached
        return Response(
            content=data,
            status_code=200,
            media_type=ctype,
            headers={
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
                "Access-Control-Allow-Origin": "*",
                "X-Lot-Image-Cache": "HIT",
            },
        )

    attempts: list[tuple[str, str]] = [(target, _referer_for(host, target))]
    if "copart" in host.lower():
        # UK assets are on cs.copart.com. Try .co.uk first, then the original size.
        attempts = [
            (target, "https://www.copart.co.uk/"),
            (target, "https://www.copart.com/"),
        ]
        if original != target:
            attempts.append((original, "https://www.copart.co.uk/"))
        hrs = re.sub(r"_(?:ful|thb)\.", "_hrs.", original, flags=re.I)
        if hrs not in {target, original}:
            attempts.append((hrs, "https://www.copart.co.uk/"))

    upstream = None
    used_url = target
    last_status = 502
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=18.0) as client:
            for url, referer in attempts:
                hit = _read_cache(url)
                if hit:
                    data, ctype = hit
                    return Response(
                        content=data,
                        status_code=200,
                        media_type=ctype,
                        headers={
                            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
                            "Access-Control-Allow-Origin": "*",
                            "X-Lot-Image-Cache": "HIT",
                        },
                    )
                headers = {
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                    ),
                    "Referer": referer,
                    "Origin": referer.rstrip("/"),
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                }
                upstream = await client.get(url, headers=headers)
                used_url = url
                if upstream.status_code < 400 and len(upstream.content) >= 600:
                    break
                last_status = upstream.status_code
                upstream = None
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {exc}") from exc

    if upstream is None:
        if last_status == 404:
            raise HTTPException(status_code=404, detail="Not found")
        raise HTTPException(status_code=502, detail=f"Upstream {last_status}")

    ctype = upstream.headers.get("content-type") or "image/jpeg"
    if "image" not in ctype.lower() and "octet-stream" not in ctype.lower():
        ctype = "image/jpeg"

    body = upstream.content
    _write_cache(used_url, body, ctype)

    return Response(
        content=body,
        status_code=200,
        media_type=ctype,
        headers={
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "Access-Control-Allow-Origin": "*",
            "X-Lot-Image-Cache": "MISS",
        },
    )


@router.get("/api/lot-photos/{lot_id}/{filename}")
def serve_saved_lot_photo(lot_id: str, filename: str) -> FileResponse:
    path = resolve_photo_file(lot_id, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Not found")
    # Immutable-ish archive files — long browser/CDN cache for fast catalog.
    return FileResponse(
        path,
        headers={
            "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
            "Access-Control-Allow-Origin": "*",
        },
    )
