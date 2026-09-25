"""Visit every lot detail page and collect full photo galleries.

Runs nonstop until all lots in the store are enriched for the current UTC day,
then waits for new lots / next day and continues.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import urlparse

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
    if (/sprite|icon|logo|avatar|flag|pixel|1x1|blank\\./i.test(s)) return;
    urls.push(s);
  };

  // OpenGraph / JSON-LD
  document.querySelectorAll('meta[property="og:image"], meta[name="og:image"]').forEach((m) => {
    push(m.getAttribute('content'));
  });

  // Common gallery / carousel images
  const sels = [
    'img[src*="copart"]',
    'img[src*="cs.copart"]',
    'img[src*="iaai"]',
    'img[src*="manheim"]',
    'img[src*="encar"]',
    'img[src*="salvage"]',
    '[class*="gallery"] img',
    '[class*="Gallery"] img',
    '[class*="carousel"] img',
    '[class*="Carousel"] img',
    '[class*="photo"] img',
    '[class*="Photo"] img',
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

  return [...new Set(urls)];
}
"""

COPART_API_JS = """
async (lotNumber) => {
  const tryUrls = [
    `https://www.copart.com/public/data/lotdetails/solr/${lotNumber}`,
    `https://www.copart.co.uk/public/data/lotdetails/solr/${lotNumber}`,
  ];
  const out = [];
  for (const url of tryUrls) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) continue;
      const data = await res.json();
      const lot = data?.data?.lotDetails || data?.lotDetails || data?.data || data;
      const candidates = [];
      const walk = (obj) => {
        if (!obj) return;
        if (typeof obj === 'string' && /^https?:\\/\\//i.test(obj)) {
          candidates.push(obj);
          return;
        }
        if (Array.isArray(obj)) {
          obj.forEach(walk);
          return;
        }
        if (typeof obj === 'object') {
          for (const [k, v] of Object.entries(obj)) {
            if (/image|tims|img|photo|picture/i.test(k)) walk(v);
          }
        }
      };
      walk(lot);
      // Known Copart fields
      if (lot?.imagesList) walk(lot.imagesList);
      if (lot?.imageList) walk(lot.imageList);
      if (lot?.lotImages) walk(lot.lotImages);
      if (Array.isArray(lot?.tims)) walk(lot.tims);
      out.push(...candidates);
      if (out.length) break;
    } catch (e) {}
  }
  return [...new Set(out)];
}
"""


def _normalize_photo_url(url: str, source: str) -> str:
    u = (url or "").strip()
    if not u.startswith("http"):
        return ""
    # Drop tiny thumbs / icons
    if re.search(r"(sprite|icon|logo|avatar|1x1|pixel|blank\.)", u, re.I):
        return ""
    if source in ("copart", "copart_uk"):
        u = copart_image(u)
        # Prefer full-size variants
        u = re.sub(r"_th[sb]\.", "_ful.", u)
        u = re.sub(r"/thumbs?/", "/full/", u, flags=re.I)
    # Strip query size knobs when they shrink images
    parsed = urlparse(u)
    if "encar" in parsed.netloc and "imagedata" in u.lower():
        return u
    return u.split("?")[0] if "copart.com" in parsed.netloc or "iaai.com" in parsed.netloc else u


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


def needs_photo_enrichment(lot: AuctionLot, *, today: date | None = None) -> bool:
    """True if lot should be visited for gallery photos today."""
    if not lot.lotUrl:
        return False
    day = today or datetime.now(timezone.utc).date()
    imgs = [u for u in (lot.imageUrls or []) if u]
    # Already enriched today with a real gallery
    if lot.photosEnrichedAt:
        try:
            enriched_day = datetime.fromisoformat(
                lot.photosEnrichedAt.replace("Z", "+00:00")
            ).astimezone(timezone.utc).date()
            if enriched_day == day and len(imgs) >= 2:
                return False
            if enriched_day == day and len(imgs) >= 1:
                # tried today — don't hammer again same day
                return False
        except Exception:
            pass
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
        # Prefer lots with fewest photos first, then higher bids
        lots.sort(
            key=lambda l: (
                len(l.imageUrls or []),
                -(l.currentBid or 0),
            )
        )
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
        settings = get_settings()
        url = (lot.lotUrl or "").strip()
        if not url:
            return []

        await page.goto(url, wait_until="domcontentloaded", timeout=settings.scraper_timeout_ms)
        # Let carousels hydrate
        await page.wait_for_timeout(1500)

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

        # Click through a few next-arrows to force lazy loads
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
                for _ in range(8):
                    await btn.click(timeout=1500)
                    await page.wait_for_timeout(300)
                more = await page.evaluate(EXTRACT_GALLERY_JS)
                if isinstance(more, list):
                    collected.extend(str(x) for x in more)
                break
            except Exception:
                continue

        # Keep existing thumbs as fallback
        if lot.imageUrl:
            collected.append(lot.imageUrl)
        if lot.imageUrls:
            collected.extend(lot.imageUrls)

        return _dedupe(collected, lot.source)

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
                urls = await self.enrich_lot(page, lot)
                now = datetime.now(timezone.utc).isoformat()
                if urls:
                    updated = lot_store.update_photos(lot.id, urls, enriched_at=now)
                    if updated:
                        enriched += 1
                        photos += len(urls)
                        self.status.total_enriched += 1
                        self.status.total_photos += len(urls)
                self._processed_ids.add(lot.id)
                self.status.processed_today += 1
            except Exception as exc:
                errors += 1
                self.status.last_error = str(exc)
                self._processed_ids.add(lot.id)  # skip retry same day
                logger.warning("photo enrich failed %s: %s", lot.id, exc)

            delay = max(0.5, settings.scraper_photo_delay_seconds)
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
