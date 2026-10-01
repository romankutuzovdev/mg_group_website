"""Save lot galleries on disk and delete them when the auction is over.

Public URLs are `/api/lot-photos/{lot_id}/{file}` so the site shows our copies,
not the auction CDN (BY visitors often need a VPN for Copart/IAAI).

Images are resized + JPEG-compressed for fast catalog/detail loads.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import re
import shutil
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx

from app.config import get_settings

logger = logging.getLogger("mg.lot_photos")

_SAFE = re.compile(r"[^a-zA-Z0-9._-]+")
_JUNK = re.compile(
    r"\.svg(?:$|\?)|/content/[a-z]{2}\.svg|www\.copart\.(?:com|co\.uk)/content/"
    r"|\bflag\b|/logo|sprite|1x1|pixel|blank\.|bat\.bing",
    re.I,
)

# Parallel downloads per lot gallery.
_DEFAULT_CONCURRENCY = 8
# Display size — enough for detail, small enough for fast grid (~30–60 KB).
_MAX_SIDE_PX = 1000
_JPEG_QUALITY = 68
# Catalog card thumb alongside full display file.
_THUMB_SIDE_PX = 420
_THUMB_QUALITY = 62


def photos_root() -> Path:
    return Path(get_settings().lots_json_path).resolve().parent / "lot-photos"


def safe_lot_id(lot_id: str) -> str:
    cleaned = _SAFE.sub("_", (lot_id or "").strip()).strip("._")
    return (cleaned or "lot")[:120]


def is_local_photo(url: str) -> bool:
    return (url or "").startswith("/api/lot-photos/")


def _download_concurrency() -> int:
    settings = get_settings()
    raw = getattr(settings, "scraper_photo_download_concurrency", None)
    try:
        n = int(raw) if raw is not None else _DEFAULT_CONCURRENCY
    except (TypeError, ValueError):
        n = _DEFAULT_CONCURRENCY
    return max(2, min(n, 16))


def _referer(url: str, *, hint: str | None = None) -> str:
    """CDN host is often cs.copart.com even for UK lots — hint picks .co.uk."""
    hint_l = (hint or "").lower()
    if hint_l in {"uk", "copart_uk", "england"} or "co.uk" in hint_l:
        return "https://www.copart.co.uk/"
    low = url.lower()
    if "copart.co.uk" in low:
        return "https://www.copart.co.uk/"
    if "copart" in low:
        return "https://www.copart.com/"
    if "iaai" in low or "anvis" in low:
        return "https://www.iaai.com/"
    if "encar" in low:
        return "https://www.encar.com/"
    if "autoimg" in low or "che168" in low or "autohome" in low:
        return "https://global.autohome.com/"
    if "bid.cars" in low:
        return "https://bid.cars/"
    return "https://www.google.com/"


def public_path(lot_id: str, filename: str) -> str:
    return f"/api/lot-photos/{safe_lot_id(lot_id)}/{filename}"


def lot_dir(lot_id: str) -> Path:
    return photos_root() / safe_lot_id(lot_id)


def delete_lot_photos(lot_id: str) -> None:
    path = lot_dir(lot_id)
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)


def sweep_orphan_photos(live_ids: set[str]) -> int:
    """Remove photo folders for lots that are no longer in the catalog."""
    root = photos_root()
    if not root.is_dir():
        return 0
    live = {safe_lot_id(lot_id) for lot_id in live_ids}
    removed = 0
    for child in root.iterdir():
        if not child.is_dir() or child.name in live or child.name.startswith("_"):
            continue
        shutil.rmtree(child, ignore_errors=True)
        removed += 1
    if removed:
        logger.info("removed %s photo folders for ended lots", removed)
    return removed


def resolve_photo_file(lot_id: str, filename: str) -> Path | None:
    name = Path(filename).name
    if not name or name != filename or name in {".", ".."}:
        return None
    root = photos_root().resolve()
    path = (lot_dir(lot_id) / name).resolve()
    if not str(path).startswith(str(root)) or not path.is_file():
        return None
    return path


def _is_junk_url(url: str) -> bool:
    return bool(_JUNK.search(url or ""))


def _prefer_download_url(url: str) -> str:
    """Pick a mid-size CDN variant — we recompress on disk anyway."""
    u = (url or "").strip()
    if not u:
        return u
    # Copart: mid-res, not huge _ful
    if re.search(r"(?:c-static|cs)\.copart\.(?:com|co\.uk)", u, re.I):
        u = re.sub(r"_th[sb]\.", "_hrs.", u, flags=re.I)
        u = re.sub(r"_ful\.", "_hrs.", u, flags=re.I)
        return u
    # IAAI resizer — cap width for faster download
    try:
        parsed = urlparse(u)
    except Exception:
        return u
    if "vis.iaai.com" in (parsed.hostname or "").lower():
        qs = dict(parse_qsl(parsed.query, keep_blank_values=True))
        qs["width"] = "845"
        qs["height"] = "633"
        return urlunparse(parsed._replace(query=urlencode(qs)))
    return u


def _compress_image(
    raw: bytes,
    *,
    max_side: int = _MAX_SIDE_PX,
    quality: int = _JPEG_QUALITY,
) -> tuple[bytes, str]:
    """Resize + JPEG compress. Falls back to original bytes on failure."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return raw, ".jpg"

    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        elif img.mode == "L":
            img = img.convert("RGB")
        w, h = img.size
        longest = max(w, h)
        if longest > max_side:
            scale = max_side / float(longest)
            img = img.resize(
                (max(1, int(w * scale)), max(1, int(h * scale))),
                Image.Resampling.LANCZOS,
            )
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
        out = buf.getvalue()
        if len(out) < len(raw) * 0.98 or longest > max_side:
            return out, ".jpg"
        if raw[:3] == b"\xff\xd8\xff" and len(raw) <= len(out):
            return raw, ".jpg"
        return out, ".jpg"
    except Exception as exc:
        logger.debug("photo compress skipped: %s", exc)
        return raw, ".jpg"


async def _download_one(
    client: httpx.AsyncClient,
    *,
    lot_id: str,
    folder: Path,
    index: int,
    url: str,
    referer_hint: str | None,
    sem: asyncio.Semaphore,
) -> str | None:
    url = _prefer_download_url(url)
    if not url.startswith("http") or _is_junk_url(url):
        return None
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    existing = list(folder.glob(f"{index:02d}-{digest}.jpg"))
    if not existing:
        existing = list(folder.glob(f"{index:02d}-{digest}.*"))
        existing = [p for p in existing if not p.name.endswith("-th.jpg")]
    if existing:
        # Ensure catalog thumb exists next to display file
        thumb_name = f"{index:02d}-{digest}-th.jpg"
        if not (folder / thumb_name).is_file():
            try:
                data, _ = _compress_image(
                    existing[0].read_bytes(),
                    max_side=_THUMB_SIDE_PX,
                    quality=_THUMB_QUALITY,
                )
                (folder / thumb_name).write_bytes(data)
            except OSError:
                pass
        return public_path(lot_id, existing[0].name)

    async with sem:
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                "Referer": _referer(url, hint=referer_hint),
            }
            response = await client.get(url, headers=headers)
        except Exception as exc:
            logger.debug("photo download %s: %s", url[:80], exc)
            return None

    if response.status_code >= 400 or len(response.content) < 800:
        return None
    ctype = (response.headers.get("content-type") or "").lower()
    if "image" not in ctype and "octet-stream" not in ctype:
        return None

    data, ext = _compress_image(response.content)
    if len(data) < 600:
        return None
    filename = f"{index:02d}-{digest}{ext}"
    (folder / filename).write_bytes(data)

    # Catalog thumb (smaller JPEG)
    try:
        thumb, _ = _compress_image(
            response.content,
            max_side=_THUMB_SIDE_PX,
            quality=_THUMB_QUALITY,
        )
        if len(thumb) >= 400:
            (folder / f"{index:02d}-{digest}-th.jpg").write_bytes(thumb)
    except Exception:
        pass

    return public_path(lot_id, filename)


def to_catalog_thumb_url(local_url: str) -> str:
    """Map `/api/lot-photos/.../01-abc.jpg` → `.../01-abc-th.jpg` when present."""
    u = (local_url or "").strip()
    if not is_local_photo(u) or u.endswith("-th.jpg"):
        return u
    if "." not in u.rsplit("/", 1)[-1]:
        return u
    base, _, ext = u.rpartition(".")
    return f"{base}-th.{ext}"


def thumb_file_exists(local_url: str) -> bool:
    u = to_catalog_thumb_url(local_url)
    if u == local_url or not is_local_photo(u):
        return False
    # /api/lot-photos/{lot_id}/{file}
    parts = u.strip("/").split("/")
    if len(parts) < 4:
        return False
    lot_id, filename = parts[2], parts[3]
    return resolve_photo_file(lot_id, filename) is not None


async def archive_gallery(
    lot_id: str,
    urls: list[str],
    *,
    referer_hint: str | None = None,
) -> list[str]:
    """Download remote gallery URLs in parallel, compress, store on disk.

    Already-local paths are kept. Returns only `/api/lot-photos/...` URLs
    (empty list if nothing could be saved).
    """
    if not lot_id:
        return []
    folder = lot_dir(lot_id)
    folder.mkdir(parents=True, exist_ok=True)

    local_kept: list[str] = []
    remote: list[str] = []
    seen: set[str] = set()
    for raw in urls:
        url = (raw or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        if is_local_photo(url):
            # Gallery list uses display files; skip catalog -th variants.
            if url.endswith("-th.jpg"):
                continue
            local_kept.append(url)
            continue
        if url.startswith("http") and not _is_junk_url(url):
            remote.append(url)

    if not remote and local_kept:
        return local_kept

    sem = asyncio.Semaphore(_download_concurrency())
    timeout = httpx.Timeout(12.0, connect=5.0)
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        tasks = [
            _download_one(
                client,
                lot_id=lot_id,
                folder=folder,
                index=i,
                url=url,
                referer_hint=referer_hint,
                sem=sem,
            )
            for i, url in enumerate(remote, start=1)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    saved: list[str] = list(local_kept)
    for item in results:
        if isinstance(item, str) and item:
            saved.append(item)
        elif isinstance(item, Exception):
            logger.debug("photo task error: %s", item)

    # Stable order, unique
    out: list[str] = []
    seen_out: set[str] = set()
    for u in saved:
        if u not in seen_out:
            seen_out.add(u)
            out.append(u)

    if out:
        logger.info(
            "archived %s/%s photos for %s (parallel=%s)",
            len(out),
            len(remote) + len(local_kept),
            lot_id,
            _download_concurrency(),
        )
    else:
        logger.warning("archive empty for %s (%s remote urls)", lot_id, len(remote))
    return out
