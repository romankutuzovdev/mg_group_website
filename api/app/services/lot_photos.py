"""Save lot galleries on disk and delete them when the auction is over.

Public URLs are `/api/lot-photos/{lot_id}/{file}` so the site shows our copies,
not the auction CDN.
"""

from __future__ import annotations

import hashlib
import logging
import re
import shutil
from pathlib import Path

import httpx

from app.config import get_settings

logger = logging.getLogger("mg.lot_photos")

_SAFE = re.compile(r"[^a-zA-Z0-9._-]+")


def photos_root() -> Path:
    return Path(get_settings().lots_json_path).resolve().parent / "lot-photos"


def safe_lot_id(lot_id: str) -> str:
    cleaned = _SAFE.sub("_", (lot_id or "").strip()).strip("._")
    return (cleaned or "lot")[:120]


def is_local_photo(url: str) -> bool:
    return (url or "").startswith("/api/lot-photos/")


def _referer(url: str) -> str:
    low = url.lower()
    if "copart.co.uk" in low:
        return "https://www.copart.co.uk/"
    if "copart" in low:
        return "https://www.copart.com/"
    if "iaai" in low or "anvis" in low:
        return "https://www.iaai.com/"
    if "encar" in low:
        return "https://www.encar.com/"
    if "bid.cars" in low:
        return "https://bid.cars/"
    return "https://www.google.com/"


def _ext(content_type: str, url: str) -> str:
    ctype = (content_type or "").lower()
    if "png" in ctype or url.lower().endswith(".png"):
        return ".png"
    if "webp" in ctype or url.lower().endswith(".webp"):
        return ".webp"
    if "gif" in ctype:
        return ".gif"
    return ".jpg"


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
        if not child.is_dir() or child.name in live:
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


async def archive_gallery(lot_id: str, urls: list[str]) -> list[str]:
    """Download remote gallery URLs. Already-local paths are kept."""
    if not lot_id:
        return []
    folder = lot_dir(lot_id)
    folder.mkdir(parents=True, exist_ok=True)
    saved: list[str] = []
    seen: set[str] = set()
    headers_base = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    async with httpx.AsyncClient(follow_redirects=True, timeout=25.0) as client:
        index = 0
        for raw in urls:
            url = (raw or "").strip()
            if not url or url in seen:
                continue
            seen.add(url)
            if is_local_photo(url):
                saved.append(url)
                continue
            if not url.startswith("http"):
                continue
            index += 1
            digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
            existing = list(folder.glob(f"{index:02d}-{digest}.*"))
            if existing:
                saved.append(public_path(lot_id, existing[0].name))
                continue
            try:
                headers = {**headers_base, "Referer": _referer(url)}
                response = await client.get(url, headers=headers)
            except Exception as exc:
                logger.debug("photo download %s: %s", url[:80], exc)
                continue
            if response.status_code >= 400 or len(response.content) < 800:
                continue
            ctype = response.headers.get("content-type") or ""
            if "image" not in ctype.lower() and "octet-stream" not in ctype.lower():
                continue
            filename = f"{index:02d}-{digest}{_ext(ctype, url)}"
            (folder / filename).write_bytes(response.content)
            saved.append(public_path(lot_id, filename))
    if saved:
        logger.info("archived %s photos for %s", len(saved), lot_id)
    return saved
