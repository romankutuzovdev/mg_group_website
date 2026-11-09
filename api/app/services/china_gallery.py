"""Full photo gallery for a China (Autohome / che168) lot, fetched on demand.

The che168 search returns one picture per car, and opening all ~240k detail
pages up front would take months. So the gallery is read when someone opens the
lot on the site: the Windows scraper opens the Autohome detail page on its
``lot_lookup`` tab, reads ``catepiclist`` from the page data, copies the cover
to R2 and stores the gallery in the catalog. Later views come from the catalog.

The public VPS has no Chrome and forwards the request to Windows.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx
from playwright.async_api import Page

from app.config import get_settings
from app.data.store import lot_store
from app.models.lots import AuctionLot

logger = logging.getLogger("mg.china_gallery")

GALLERY_PATH = "/api/v1/lots/{slug}/gallery"
MAX_PHOTOS = 40
# A lot whose page gave nothing is not retried for this long.
_FAIL_TTL_SECONDS = 30 * 60
_PAGE_TIMEOUT_SECONDS = 25.0
_PROXY_TIMEOUT_SECONDS = 35.0

# catepiclist sits in the Next.js payload as escaped JSON: walk it by brackets.
CATEPICLIST_JS = """
() => {
  const html = document.documentElement.innerHTML.replace(/\\\\"/g, '"');
  const at = html.indexOf('"catepiclist":');
  if (at < 0) return [];
  const rest = html.slice(at + 14);
  let depth = 0, end = -1;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  let groups;
  try { groups = JSON.parse(rest.slice(0, end + 1)); } catch (e) { return []; }
  const urls = [];
  for (const g of groups || []) {
    for (const u of (g && g.list) || []) {
      if (typeof u !== 'string') continue;
      const s = u.trim();
      if (s.startsWith('//')) urls.push('https:' + s);
      else if (s.startsWith('http')) urls.push(s);
    }
  }
  return [...new Set(urls)];
}
"""

_failed: dict[str, float] = {}
_inflight: dict[str, asyncio.Task] = {}


def _photos(lot: AuctionLot) -> list[str]:
    urls = list(lot.imageUrls or [])
    if lot.imageUrl and lot.imageUrl not in urls:
        urls.insert(0, lot.imageUrl)
    return [u for u in urls if u]


def has_gallery(lot: AuctionLot) -> bool:
    return len(_photos(lot)) > 1


def is_china_lot(lot: AuctionLot) -> bool:
    return (lot.source or "") == "china_market" or (lot.region or "") == "china"


def _role() -> str:
    return (get_settings().app_role or "all").strip().lower()


def _recently_failed(lot_id: str) -> bool:
    at = _failed.get(lot_id)
    if at is None:
        return False
    if time.monotonic() - at > _FAIL_TTL_SECONDS:
        _failed.pop(lot_id, None)
        return False
    return True


async def _read_gallery(page: Page, url: str) -> list[str]:
    await page.goto(url, wait_until="domcontentloaded", timeout=20000)
    urls = await page.evaluate(CATEPICLIST_JS)
    if not urls:
        # Payload may stream in after DOMContentLoaded.
        await page.wait_for_timeout(1500)
        urls = await page.evaluate(CATEPICLIST_JS)
    return [str(u) for u in urls or [] if isinstance(u, str)]


async def _cover_to_r2(lot: AuctionLot, urls: list[str]) -> list[str]:
    """Archive the first photo and put its CDN copy first. Keeps the rest remote."""
    from app.services.lot_photos import archive_gallery, is_our_photo, merge_gallery_urls
    from app.services.r2_photos import promote_gallery_urls

    ours = [u for u in _photos(lot) if is_our_photo(u)]
    if ours:
        # The cover is already ours; its che168 original is urls[0], drop it.
        return merge_gallery_urls(ours, urls[1:])
    saved = await archive_gallery(lot.id, urls[:1], referer_hint="china_market")
    merged = merge_gallery_urls(saved, urls[1:] if saved else urls)
    # boto3 is blocking: keep it off the loop the API shares with the scrapers.
    return await asyncio.to_thread(
        promote_gallery_urls, lot.id, merged, region=lot.region, source=lot.source
    )


async def _fetch_on_windows(lot: AuctionLot) -> list[str]:
    from app.scraper.worker import scraper_worker

    url = (lot.lotUrl or "").strip()
    if not url:
        return []
    found = await scraper_worker.open_lot_on_lookup_tab(
        lambda page: _read_gallery(page, url),
        timeout_sec=_PAGE_TIMEOUT_SECONDS,
    )
    if not found:
        return []
    merged = await _cover_to_r2(lot, found[:MAX_PHOTOS])
    updated = lot_store.update_photos(lot.id, merged[:MAX_PHOTOS])
    logger.info("china gallery %s: %s photos", lot.id, len(merged))
    return _photos(updated) if updated else merged


async def _fetch_via_proxy(lot: AuctionLot) -> list[str]:
    from app.services.scraper_proxy import scraper_api_base, scraper_api_key

    base = scraper_api_base()
    if not base:
        return []
    headers = {"Accept": "application/json"}
    key = scraper_api_key()
    if key:
        headers["X-API-Key"] = key
    target = base + GALLERY_PATH.format(slug=lot.slug)
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(_PROXY_TIMEOUT_SECONDS, connect=10.0),
            follow_redirects=False,
        ) as client:
            res = await client.post(target, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("china gallery proxy %s: %s", lot.id, type(exc).__name__)
        return []
    if res.status_code >= 300:
        logger.warning("china gallery proxy %s: http %s", lot.id, res.status_code)
        return []
    try:
        payload = res.json()
    except ValueError:
        return []
    urls = [u for u in (payload.get("imageUrls") or []) if isinstance(u, str) and u]
    if len(urls) > 1:
        # Windows pushes this too; storing now serves the next view at once.
        lot_store.update_photos(lot.id, urls[:MAX_PHOTOS])
    return urls


async def _fetch(lot: AuctionLot) -> list[str]:
    if _role() == "public":
        return await _fetch_via_proxy(lot)
    return await _fetch_on_windows(lot)


async def ensure_china_gallery(lot: AuctionLot) -> dict[str, Any]:
    """Return the lot's photos, reading the full gallery once if it has only a cover."""
    current = _photos(lot)
    if not is_china_lot(lot) or has_gallery(lot):
        return {"imageUrls": current, "fetched": False}
    if _recently_failed(lot.id):
        return {"imageUrls": current, "fetched": False, "error": "recently_failed"}

    task = _inflight.get(lot.id)
    if task is None:
        task = asyncio.create_task(_fetch(lot))
        _inflight[lot.id] = task
        task.add_done_callback(lambda _t, lot_id=lot.id: _inflight.pop(lot_id, None))
    try:
        urls = await asyncio.shield(task)
    except Exception as exc:
        logger.warning("china gallery %s failed: %s", lot.id, exc)
        urls = []
    if len(urls) > 1:
        return {"imageUrls": urls, "fetched": True}
    _failed[lot.id] = time.monotonic()
    return {"imageUrls": current, "fetched": False, "error": "no_gallery"}
