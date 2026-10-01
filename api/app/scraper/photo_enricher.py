"""Visit every lot detail page in Chrome and collect full photo galleries.

Always opens the auction URL in the photos tab — never skips via CDN URLs
already stored in the catalog DB. Runs nonstop until all lots are enriched
for the current UTC day, then waits for new lots / next day and continues.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import parse_qsl, urlparse

from playwright.async_api import Browser, Page

from app.config import get_settings
from app.data.store import lot_store
from app.models.lots import AuctionLot
from app.scraper.browser import close_agent_tab, get_shared_context, open_agent_tab
from app.scraper.mapper import copart_image

logger = logging.getLogger("mg.scraper.photos")

# JS: collect candidate image URLs from a lot detail page (generic).
EXTRACT_GALLERY_JS = """
() => {
  const urls = [];
  const push = (u) => {
    if (!u || typeof u !== 'string') return;
    const s = u.trim();
    if (!s.startsWith('http')) return;
    if (/sprite|icon|logo|avatar|flag|pixel|1x1|blank\\.|\\.svg(?:$|\\?)|\\/content\\/[a-z]{2}\\.svg/i.test(s)) return;
    urls.push(s);
  };

  // OpenGraph / JSON-LD
  document.querySelectorAll('meta[property="og:image"], meta[name="og:image"]').forEach((m) => {
    push(m.getAttribute('content'));
  });

  // Common gallery / carousel images (all auction sources)
  const sels = [
    'img[src*="copart"]',
    'img[src*="cs.copart"]',
    'img[src*="iaai"]',
    'img[src*="anvis"]',
    'img[src*="manheim"]',
    'img[src*="encar"]',
    'img[src*="salvage"]',
    'img[src*="autoimg"]',
    'img[src*="che168"]',
    'img[src*="autohome"]',
    'img[src*="bid.cars"]',
    '[class*="gallery"] img',
    '[class*="Gallery"] img',
    '[class*="carousel"] img',
    '[class*="Carousel"] img',
    '[class*="photo"] img',
    '[class*="Photo"] img',
    '[class*="swiper"] img',
    '[id*="image"] img',
    '[data-testid*="image"] img',
    'picture source',
    'img[data-src]',
    'img[data-lazy]',
    'img[data-original]',
  ];
  for (const sel of sels) {
    document.querySelectorAll(sel).forEach((el) => {
      push(el.getAttribute('src') || el.getAttribute('data-src') ||
           el.getAttribute('data-lazy') || el.getAttribute('data-original') ||
           el.getAttribute('srcset')?.split(',')[0]?.trim()?.split(' ')[0]);
    });
  }

  // Background images in style attributes (some carousels)
  document.querySelectorAll('[style*="background"]').forEach((el) => {
    const st = el.getAttribute('style') || '';
    const m = st.match(/url\\(['"]?(https?:[^'")\\s]+)/i);
    if (m) push(m[1]);
  });

  // IAA identifies each shot by imageKeys. Thumbs and the main viewer share that id.
  document.querySelectorAll('[data-imagekey], [data-image-key]').forEach((el) => {
    const key = el.getAttribute('data-imagekey') || el.getAttribute('data-image-key');
    if (key) push('https://vis.iaai.com/resizer?imageKeys=' + key + '&width=845&height=633');
  });
  const html = document.documentElement ? document.documentElement.innerHTML : '';
  const keyRe = /imageKeys=([^&"'\\s<>]+)/gi;
  let km;
  while ((km = keyRe.exec(html))) {
    let key = km[1];
    try { key = decodeURIComponent(key); } catch (e) {}
    push('https://vis.iaai.com/resizer?imageKeys=' + key + '&width=845&height=633');
  }

  return [...new Set(urls)];
}
"""

COPART_API_JS = """
async (lotNumber) => {
  const origin = /copart\\.co\\.uk/i.test(location.hostname)
    ? 'https://www.copart.co.uk'
    : 'https://www.copart.com';
  try {
    const res = await fetch(origin + '/public/data/lotdetails/solr/lotImages/' + lotNumber, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const list = (((data || {}).data || {}).imagesList) || {};
    const arr = Array.isArray(list.content) ? list.content
      : Array.isArray(list.IMAGE) ? list.IMAGE : [];
    const urls = [];
    for (const item of arr) {
      const u = (item && (item.highResUrl || item.fullUrl || item.thumbnailUrl)) || '';
      if (typeof u === 'string' && u.startsWith('http')) urls.push(u.split('?')[0]);
    }
    return [...new Set(urls)];
  } catch (e) {
    return [];
  }
}
"""


def _canonical_iaai_photo(url: str) -> str:
    """Keep imageKeys. Dropping the query collapses every IAA shot to /resizer."""
    parsed = urlparse(url)
    if "iaai" not in parsed.netloc.lower():
        return url
    key = ""
    for name, value in parse_qsl(parsed.query, keep_blank_values=False):
        if name.lower() == "imagekeys" and value.strip():
            key = value.strip()
            break
    if not key:
        if "resizer" in parsed.path.lower():
            return ""
        return url
    return f"https://vis.iaai.com/resizer?imageKeys={key}&width=845&height=633"


def _is_useless_photo(url: str) -> bool:
    u = (url or "").strip()
    if not u:
        return True
    if re.search(
        r"\.svg(?:$|\?)|/content/[a-z]{2}\.svg|www\.copart\.(?:com|co\.uk)/content/|\bflag\b|/logo|sprite|1x1|pixel|blank\.",
        u,
        re.I,
    ):
        return True
    parsed = urlparse(u)
    if "iaai" in parsed.netloc.lower() and "resizer" in parsed.path.lower():
        has_key = any(
            name.lower() == "imagekeys" and value.strip()
            for name, value in parse_qsl(parsed.query, keep_blank_values=False)
        )
        return not has_key
    return False


def _normalize_photo_url(url: str, source: str) -> str:
    u = (url or "").strip()
    if not u.startswith("http"):
        return ""
    # Drop tiny thumbs / icons
    if re.search(r"(sprite|icon|logo|avatar|1x1|pixel|blank\.)", u, re.I):
        return ""
    if source in ("copart", "copart_uk") or "copart" in urlparse(u).netloc.lower():
        u = copart_image(u)
        # Prefer full-size variants
        u = re.sub(r"_th[sb]\.", "_ful.", u)
        u = re.sub(r"/thumbs?/", "/full/", u, flags=re.I)
    parsed = urlparse(u)
    host = parsed.netloc.lower()
    if "iaai" in host or source == "iaai":
        return _canonical_iaai_photo(u)
    if "encar" in host and "imagedata" in u.lower():
        return u
    # Copart photo id lives in the path; the query is a short-lived token.
    if "copart.com" in host or "copart.co.uk" in host:
        return u.split("?")[0]
    return u


def _dedupe(urls: list[str], source: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in urls:
        u = _normalize_photo_url(raw, source)
        if not u or u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def normalize_gallery(urls: list[str], source: str) -> list[str]:
    return _dedupe(urls, source)[:40]


def needs_photo_enrichment(lot: AuctionLot, *, today: date | None = None) -> bool:
    """True if lot still needs a full local gallery on our server."""
    if not lot.lotUrl:
        return False
    day = today or datetime.now(timezone.utc).date()
    imgs = [
        u
        for u in (list(lot.imageUrls or []) + ([lot.imageUrl] if lot.imageUrl else []))
        if u and (u.startswith("/api/lot-photos/") or not _is_useless_photo(u))
    ]
    local = [
        u
        for u in imgs
        if (u or "").startswith("/api/lot-photos/") and not (u or "").endswith("-th.jpg")
    ]
    remotes = [u for u in imgs if (u or "").startswith("http")]
    # Need a real gallery locally (not a single cover). Keep going until we
    # archive enough shots or remotes are exhausted.
    min_local = 3
    if len(local) >= min_local and lot.photosEnrichedAt:
        try:
            enriched_day = datetime.fromisoformat(
                lot.photosEnrichedAt.replace("Z", "+00:00")
            ).astimezone(timezone.utc).date()
            if enriched_day == day:
                # Done when we have 3+ locals and either no remotes left to chase
                # or locals already cover most of the remote gallery.
                if not remotes or len(local) >= min(8, max(min_local, len(remotes))):
                    return False
        except Exception:
            if len(local) >= min_local and not remotes:
                return False
    return True


@dataclass
class PhotoAgentStatus:
    name: str = "photos"
    running: bool = False
    tab_open: bool = False
    cycles: int = 0
    total_enriched: int = 0
    total_photos: int = 0
    queue_remaining: int = 0
    last_lot_id: str | None = None
    last_started_at: str | None = None
    last_finished_at: str | None = None
    last_error: str | None = None
    day: str | None = None
    processed_today: int = 0


class PhotoEnrichmentAgent:
    """One Chrome tab that walks every lot card and pulls all photos, nonstop."""

    def __init__(self) -> None:
        self.status = PhotoAgentStatus()
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._page: Page | None = None
        self._processed_ids: set[str] = set()
        self._day: date | None = None

    def _roll_day(self) -> None:
        today = datetime.now(timezone.utc).date()
        if self._day != today:
            self._day = today
            self._processed_ids.clear()
            self.status.day = today.isoformat()
            self.status.processed_today = 0
            logger.info("photo enricher: new UTC day %s — queue reset", today)

    def _queue(self) -> list[AuctionLot]:
        self._roll_day()
        assert self._day is not None
        lots = [
            lot
            for lot in lot_store.all()
            if needs_photo_enrichment(lot, today=self._day)
            and lot.id not in self._processed_ids
        ]
        # Prefer thin galleries first; USA Copart/IAAI before others.
        def _prio(l: AuctionLot) -> tuple:
            src = (l.source or "").lower()
            region = (l.region or "").lower()
            if src in ("copart", "iaai") or region == "usa":
                region_rank = 0
            elif src == "copart_uk" or region == "uk":
                region_rank = 1
            else:
                region_rank = 2
            imgs = [u for u in (l.imageUrls or []) if u and not _is_useless_photo(u)]
            locals_n = sum(1 for u in imgs if u.startswith("/api/lot-photos/"))
            return (locals_n, region_rank, -(l.currentBid or 0))

        lots.sort(key=_prio)
        self.status.queue_remaining = len(lots)
        return lots

    async def attach_tab(self, browser: Browser) -> Page:
        if self._page is not None and not self._page.is_closed():
            self.status.tab_open = True
            return self._page
        ctx = await get_shared_context(browser)
        self._page = await open_agent_tab(ctx, label="photos", url="about:blank")
        self.status.tab_open = True
        return self._page

    async def detach_tab(self) -> None:
        await close_agent_tab(self._page)
        self._page = None
        self.status.tab_open = False

    async def start(self, browser: Browser) -> None:
        if self._task and not self._task.done():
            return
        await self.attach_tab(browser)
        self._stop = asyncio.Event()
        self.status.running = True
        self._task = asyncio.create_task(self._loop(browser), name="agent-photos")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            try:
                await asyncio.wait_for(asyncio.shield(self._task), timeout=60)
            except Exception:
                self._task.cancel()
        await self.detach_tab()
        self.status.running = False

    async def enrich_lot(self, page: Page, lot: AuctionLot) -> list[str]:
        """Always open the lot detail page in Chrome and collect gallery URLs."""
        settings = get_settings()
        url = (lot.lotUrl or "").strip()
        if not url:
            return []

        try:
            await page.bring_to_front()
        except Exception:
            pass
        await page.goto(url, wait_until="domcontentloaded", timeout=settings.scraper_timeout_ms)
        # Brief hydrate — keep short so catalog photos archive quickly
        await page.wait_for_timeout(700)

        collected: list[str] = []

        # Copart: try lot-details API from page context (uses cookies/session)
        if lot.source in ("copart", "copart_uk") and lot.lotNumber:
            try:
                api_imgs = await page.evaluate(COPART_API_JS, lot.lotNumber)
                if isinstance(api_imgs, list):
                    collected.extend(str(x) for x in api_imgs)
            except Exception as exc:
                logger.debug("copart api photos %s: %s", lot.lotNumber, exc)

        # DOM gallery
        try:
            dom_imgs = await page.evaluate(EXTRACT_GALLERY_JS)
            if isinstance(dom_imgs, list):
                collected.extend(str(x) for x in dom_imgs)
        except Exception as exc:
            logger.debug("dom photos %s: %s", lot.id, exc)

        # Click next-arrows only when API/DOM gave a thin gallery
        if len(_dedupe(collected, lot.source)) < 4:
            for sel in (
                'button[aria-label*="next" i]',
                'button[class*="next" i]',
                '[class*="swiper-button-next"]',
                ".slick-next",
            ):
                try:
                    btn = page.locator(sel).first
                    if await btn.count() == 0:
                        continue
                    for _ in range(6):
                        await btn.click(timeout=800)
                        await page.wait_for_timeout(120)
                        more = await page.evaluate(EXTRACT_GALLERY_JS)
                        if isinstance(more, list):
                            collected.extend(str(x) for x in more)
                    break
                except Exception:
                    continue

        # Store remotes only as last-resort extras (never skip opening the page)
        if lot.imageUrl:
            collected.append(lot.imageUrl)
        if lot.imageUrls:
            collected.extend(lot.imageUrls)

        urls = _dedupe(collected, lot.source)
        # IAAI vis.iaai.com URLs use imageKeys — lot number is rarely in the URL.
        # Do not filter by lotNumber or we keep only the listing thumb.
        return urls[:40]

    async def run_batch(self, browser: Browser, *, limit: int | None = None) -> dict[str, Any]:
        """Process up to `limit` lots (None = settings batch size)."""
        settings = get_settings()
        batch = limit if limit is not None else max(1, settings.scraper_photo_batch_size)
        started = datetime.now(timezone.utc).isoformat()
        self.status.last_started_at = started
        self.status.last_error = None

        page = self._page
        if page is None or page.is_closed():
            page = await self.attach_tab(browser)

        queue = self._queue()[:batch]
        enriched = 0
        photos = 0
        errors = 0

        for lot in queue:
            if self._stop.is_set():
                break
            self.status.last_lot_id = lot.id
            try:
                now = datetime.now(timezone.utc).isoformat()
                hint = "uk" if (
                    lot.region == "uk" or lot.source == "copart_uk"
                ) else (lot.source or lot.region or "")
                from app.services.lot_photos import (
                    archive_gallery,
                    merge_gallery_urls,
                )

                # Always open the lot page in Chrome — never skip via DB CDN alone.
                urls = await self.enrich_lot(page, lot)
                saved: list[str] = []
                if urls:
                    # Download with Chrome cookies so auction CDNs succeed.
                    saved = await archive_gallery(
                        lot.id,
                        urls[:40],
                        referer_hint=hint,
                        page=page,
                    )

                # Locals first for speed; keep CDN remotes so UI shows full gallery
                # even when only part of the archive succeeded.
                existing = list(lot.imageUrls or []) + (
                    [lot.imageUrl] if lot.imageUrl else []
                )
                merged = merge_gallery_urls(saved, urls, existing)
                local_count = sum(
                    1 for u in merged if (u or "").startswith("/api/lot-photos/")
                )

                if merged and (saved or len(urls) >= 2):
                    updated = lot_store.update_photos(
                        lot.id, merged, enriched_at=now
                    )
                    if updated:
                        enriched += 1
                        photos += len(saved)
                        self.status.total_enriched += 1
                        self.status.total_photos += len(saved)
                    # Only mark done when we archived a real gallery (3+).
                    # Thin archives stay in queue for retry.
                    if local_count >= 3 or (urls and local_count >= len(urls)):
                        self._processed_ids.add(lot.id)
                        self.status.processed_today += 1
                    else:
                        logger.info(
                            "photo enrich partial %s locals=%s remotes=%s — retry later",
                            lot.id,
                            local_count,
                            len([u for u in merged if u.startswith("http")]),
                        )
                elif urls:
                    errors += 1
                    self.status.last_error = f"archive_empty:{lot.id}"
                    logger.warning("photo archive empty %s — will retry", lot.id)
                else:
                    self._processed_ids.add(lot.id)
                    self.status.processed_today += 1
            except Exception as exc:
                errors += 1
                self.status.last_error = str(exc)
                logger.warning("photo enrich failed %s: %s", lot.id, exc)

            delay = max(0.3, settings.scraper_photo_delay_seconds)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=delay)
                break
            except asyncio.TimeoutError:
                continue

        if settings.scraper_persist and enriched:
            lot_store.persist()

        self.status.cycles += 1
        self.status.queue_remaining = len(self._queue())
        finished = datetime.now(timezone.utc).isoformat()
        self.status.last_finished_at = finished
        return {
            "source": "photos",
            "started_at": started,
            "finished_at": finished,
            "batch": len(queue),
            "enriched": enriched,
            "photos": photos,
            "errors": errors,
            "queue_remaining": self.status.queue_remaining,
            "processed_today": self.status.processed_today,
        }

    async def _loop(self, browser: Browser) -> None:
        settings = get_settings()
        while not self._stop.is_set():
            if self._page is None or self._page.is_closed():
                try:
                    await self.attach_tab(browser)
                except Exception as exc:
                    self.status.last_error = f"tab_reopen: {exc}"
                    logger.exception("photo tab reopen failed")
                    await asyncio.sleep(30)
                    continue

            stats = await self.run_batch(browser)
            remaining = int(stats.get("queue_remaining") or 0)
            logger.info(
                "photos cycle: enriched=%s photos=%s remaining=%s today=%s",
                stats.get("enriched"),
                stats.get("photos"),
                remaining,
                self.status.processed_today,
            )

            if remaining <= 0:
                # Day complete — wait for new lots or next UTC day
                idle = max(60, settings.scraper_photo_idle_seconds)
                logger.info("photos: queue empty, idle %ss", idle)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=idle)
                    break
                except asyncio.TimeoutError:
                    # Force day roll check; new list lots may have appeared
                    continue
            # otherwise immediately continue next batch (nonstop)
        self.status.running = False

    def snapshot(self) -> dict[str, Any]:
        return {
            "name": self.status.name,
            "running": self.status.running,
            "tab_open": self.status.tab_open,
            "cycles": self.status.cycles,
            "total_enriched": self.status.total_enriched,
            "total_photos": self.status.total_photos,
            "queue_remaining": self.status.queue_remaining,
            "processed_today": self.status.processed_today,
            "day": self.status.day,
            "last_lot_id": self.status.last_lot_id,
            "last_started_at": self.status.last_started_at,
            "last_finished_at": self.status.last_finished_at,
            "last_error": self.status.last_error,
        }
