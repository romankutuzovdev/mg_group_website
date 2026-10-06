"""Save lot galleries on disk and delete them when the auction is over.

Public URLs are `/api/lot-photos/{lot_id}/{file}` so the site shows our copies,
not the auction CDN (BY visitors often need a VPN for Copart/IAAI).

Images are resized + JPEG-compressed for fast catalog/detail loads.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import logging
import re
import shutil
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx

from app.config import get_settings

logger = logging.getLogger("mg.lot_photos")

_SAFE = re.compile(r"[^a-zA-Z0-9._-]+")
_JUNK = re.compile(
    r"\.svg(?:$|\?)|/content/[a-z]{2}\.svg|www\.copart\.(?:com|co\.uk)/content/"
    r"|https?://(?:www\.)?copart\.(?:com|co\.uk)/?(?:$|\?)"
    r"|\bflag\b|/logo|sprite|1x1|pixel|blank\.|bat\.bing",
    re.I,
)

# Runs inside the auction Chrome tab so CDN bytes use the same IP/cookies as the page.
# Python httpx from the Windows host gets 403 on cs.copart.com.
_CHROME_FETCH_JS = """
async (urls) => {
  const grab = async (url) => {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return { ok: false, status: res.status };
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.length < 800 || bytes.length > 8_000_000) {
        return { ok: false, status: res.status, error: 'size' };
      }
      let binary = '';
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
      }
      return { ok: true, b64: btoa(binary), ctype: (res.headers.get('content-type') || '') };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  };
  const out = [];
  for (let i = 0; i < urls.length; i += 4) {
    const part = urls.slice(i, i + 4);
    const rows = await Promise.all(part.map((url) => grab(url)));
    out.push(...rows);
  }
  return out;
}
"""

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


async def _fetch_image_bytes(
    url: str,
    *,
    referer_hint: str | None,
    client: httpx.AsyncClient | None = None,
    pw_request: Any | None = None,
) -> tuple[bytes, str] | None:
    """Fetch image bytes via Playwright request (cookies) or httpx."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": _referer(url, hint=referer_hint),
    }
    # Prefer Chrome context — Copart/IAAI CDN often needs auction cookies.
    if pw_request is not None:
        try:
            resp = await pw_request.get(url, headers=headers, timeout=15_000)
            if resp.status >= 400:
                return None
            body = await resp.body()
            ctype = (resp.headers.get("content-type") or "").lower()
            if len(body) >= 800 and ("image" in ctype or "octet-stream" in ctype or body[:3] == b"\xff\xd8\xff"):
                return body, ctype
        except Exception as exc:
            logger.debug("pw photo %s: %s", url[:80], exc)
    if client is not None:
        try:
            response = await client.get(url, headers=headers)
        except Exception as exc:
            logger.debug("httpx photo %s: %s", url[:80], exc)
            return None
        if response.status_code >= 400 or len(response.content) < 800:
            return None
        ctype = (response.headers.get("content-type") or "").lower()
        if "image" not in ctype and "octet-stream" not in ctype:
            return None
        return response.content, ctype
    return None


async def _download_one(
    *,
    lot_id: str,
    folder: Path,
    index: int,
    url: str,
    referer_hint: str | None,
    sem: asyncio.Semaphore,
    client: httpx.AsyncClient | None = None,
    pw_request: Any | None = None,
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
        fetched = await _fetch_image_bytes(
            url, referer_hint=referer_hint, client=client, pw_request=pw_request
        )
    if not fetched:
        return None
    raw, _ctype = fetched

    data, ext = _compress_image(raw)
    if len(data) < 600:
        return None
    filename = f"{index:02d}-{digest}{ext}"
    (folder / filename).write_bytes(data)

    # Catalog thumb (smaller JPEG)
    try:
        thumb, _ = _compress_image(
            raw,
            max_side=_THUMB_SIDE_PX,
            quality=_THUMB_QUALITY,
        )
        if len(thumb) >= 400:
            (folder / f"{index:02d}-{digest}-th.jpg").write_bytes(thumb)
    except Exception:
        pass

    return public_path(lot_id, filename)


def merge_gallery_urls(
    saved_locals: list[str],
    *extra_url_lists: list[str],
) -> list[str]:
    """Locals first (fast same-origin), then CDN remotes so the UI keeps full gallery."""
    locals_: list[str] = []
    remotes: list[str] = []
    seen: set[str] = set()
    for raw in list(saved_locals) + [u for group in extra_url_lists for u in group]:
        u = (raw or "").strip()
        if not u or u in seen:
            continue
        if u.endswith("-th.jpg"):
            continue
        if is_local_photo(u):
            seen.add(u)
            locals_.append(u)
        elif u.startswith("http") and not _is_junk_url(u):
            seen.add(u)
            remotes.append(u)
    return (locals_ + remotes)[:40]


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


def _existing_display(folder: Path, lot_id: str, index: int, url: str) -> str | None:
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    existing = [
        p
        for p in folder.glob(f"{index:02d}-{digest}.*")
        if p.is_file() and not p.name.endswith("-th.jpg")
    ]
    if not existing:
        return None
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


def _write_display(folder: Path, lot_id: str, index: int, url: str, raw: bytes) -> str | None:
    if len(raw) < 800 or raw[:1] == b"<":
        return None
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    data, ext = _compress_image(raw)
    if len(data) < 600:
        return None
    filename = f"{index:02d}-{digest}{ext}"
    (folder / filename).write_bytes(data)
    try:
        thumb, _ = _compress_image(
            raw,
            max_side=_THUMB_SIDE_PX,
            quality=_THUMB_QUALITY,
        )
        if len(thumb) >= 400:
            (folder / f"{index:02d}-{digest}-th.jpg").write_bytes(thumb)
    except Exception:
        pass
    return public_path(lot_id, filename)


async def _cdp_read_stream(session: Any, handle: str) -> bytes:
    chunks: list[bytes] = []
    while True:
        chunk = await session.send("IO.read", {"handle": handle, "size": 512 * 1024})
        data = chunk.get("data") or ""
        if data:
            if chunk.get("base64Encoded"):
                chunks.append(base64.b64decode(data))
            else:
                chunks.append(data.encode("latin-1"))
        if chunk.get("eof"):
            break
    try:
        await session.send("IO.close", {"handle": handle})
    except Exception:
        pass
    return b"".join(chunks)


async def _cdp_fetch_url(session: Any, frame_id: str, url: str) -> bytes | None:
    result = await session.send(
        "Network.loadNetworkResource",
        {
            "frameId": frame_id,
            "url": url,
            "options": {"disableCache": False, "includeCredentials": True},
        },
    )
    resource = (result or {}).get("resource") or {}
    if not resource.get("success"):
        logger.debug(
            "cdp photo miss %s status=%s err=%s",
            url[:90],
            resource.get("httpStatusCode"),
            resource.get("netError"),
        )
        return None
    handle = resource.get("stream")
    if not handle:
        return None
    body = await _cdp_read_stream(session, handle)
    return body if len(body) >= 800 else None


async def _page_fetch_bytes(page: Any, urls: list[str]) -> list[bytes | None]:
    try:
        rows = await page.evaluate(_CHROME_FETCH_JS, urls)
    except Exception as exc:
        logger.debug("page fetch photos: %s", exc)
        return [None] * len(urls)
    out: list[bytes | None] = []
    for row in rows or []:
        if not isinstance(row, dict) or not row.get("ok") or not row.get("b64"):
            out.append(None)
            continue
        try:
            raw = base64.b64decode(row["b64"])
        except Exception:
            out.append(None)
            continue
        out.append(raw if len(raw) >= 800 else None)
    while len(out) < len(urls):
        out.append(None)
    return out[: len(urls)]


async def _archive_via_chrome_page(
    page: Any | None,
    *,
    lot_id: str,
    folder: Path,
    urls: list[str],
) -> dict[int, str]:
    """Download gallery files through the auction Chrome tab.

    ``Network.loadNetworkResource`` uses Chrome's own network (VPN/cookies).
    Plain httpx from the API host is blocked by Copart (403).
    """
    saved: dict[int, str] = {}
    if page is None or not urls:
        return saved

    pending: list[tuple[int, str]] = []
    for i, raw in enumerate(urls, start=1):
        url = _prefer_download_url(raw)
        if not url.startswith("http") or _is_junk_url(url):
            continue
        existing = _existing_display(folder, lot_id, i, url)
        if existing:
            saved[i] = existing
            continue
        pending.append((i, url))
    if not pending:
        return saved

    session = None
    frame_id = ""
    cdp_ok = True
    try:
        session = await page.context.new_cdp_session(page)
        tree = await session.send("Page.getFrameTree")
        frame_id = ((tree or {}).get("frameTree") or {}).get("frame", {}).get("id") or ""
        if not frame_id:
            cdp_ok = False
    except Exception as exc:
        logger.debug("chrome cdp session: %s", exc)
        cdp_ok = False

    still: list[tuple[int, str]] = []
    if session is not None and cdp_ok:
        for offset, (i, url) in enumerate(pending):
            try:
                raw_bytes = await _cdp_fetch_url(session, frame_id, url)
            except Exception as exc:
                logger.info("cdp photo fetch unavailable, fallback to page: %s", exc)
                still.extend(pending[offset:])
                break
            if not raw_bytes:
                still.append((i, url))
                continue
            path = _write_display(folder, lot_id, i, url, raw_bytes)
            if path:
                saved[i] = path
            else:
                still.append((i, url))
        try:
            await session.detach()
        except Exception:
            pass
    else:
        still = list(pending)

    if still:
        fetched = await _page_fetch_bytes(page, [url for _, url in still])
        for (i, url), raw_bytes in zip(still, fetched):
            if not raw_bytes:
                continue
            path = _write_display(folder, lot_id, i, url, raw_bytes)
            if path:
                saved[i] = path

    if saved:
        logger.info("chrome archived %s/%s photos for %s", len(saved), len(urls), lot_id)
    return saved


async def archive_gallery(
    lot_id: str,
    urls: list[str],
    *,
    referer_hint: str | None = None,
    page: Any | None = None,
) -> list[str]:
    """Download remote gallery URLs in parallel, compress, store on disk.

    Pass Playwright ``page`` to download with Chrome cookies (Copart/IAAI).
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

    # Copart CDN returns 403 to the Windows host. Pull bytes through the open
    # Chrome tab (same IP and cookies as the Copart UK page).
    chrome_saved = await _archive_via_chrome_page(
        page, lot_id=lot_id, folder=folder, urls=remote
    )

    missing: list[tuple[int, str]] = [
        (i, url)
        for i, url in enumerate(remote, start=1)
        if not chrome_saved.get(i)
    ]
    pw_request = None
    if page is not None and missing:
        try:
            pw_request = page.context.request
        except Exception:
            pw_request = None

    results: list[Any] = []
    if missing:
        sem = asyncio.Semaphore(_download_concurrency())
        timeout = httpx.Timeout(12.0, connect=5.0)
        async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
            tasks = [
                _download_one(
                    lot_id=lot_id,
                    folder=folder,
                    index=i,
                    url=url,
                    referer_hint=referer_hint,
                    sem=sem,
                    client=client,
                    pw_request=pw_request,
                )
                for i, url in missing
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

    by_index: dict[int, str] = dict(chrome_saved)
    for (i, _url), item in zip(missing, results):
        if isinstance(item, str) and item:
            by_index.setdefault(i, item)
        elif isinstance(item, Exception):
            logger.debug("photo task error: %s", item)

    saved: list[str] = list(local_kept)
    for i in sorted(by_index):
        saved.append(by_index[i])

    # Stable order, unique
    out: list[str] = []
    seen_out: set[str] = set()
    for u in saved:
        if u not in seen_out:
            seen_out.add(u)
            out.append(u)

    if out:
        logger.info(
            "archived %s/%s photos for %s (parallel=%s chrome=%s)",
            len(out),
            len(remote) + len(local_kept),
            lot_id,
            _download_concurrency(),
            bool(page),
        )
    else:
        logger.warning("archive empty for %s (%s remote urls)", lot_id, len(remote))
    return out
