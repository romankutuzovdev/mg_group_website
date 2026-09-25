"""SalvageMarket UK — inventory via Playwright DOM (shared Chrome tab)."""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Browser, Page

from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.salvage_market")

SEARCH_URLS = (
    # Just Added — real SPA route (verified in browser; /vehicles is 404)
    "https://www.salvagemarket.co.uk/Search?orderBy=10&pageNumber=0&pageSize=20&quickSearch=4",
    "https://www.salvagemarket.co.uk/Search",
    "https://www.salvagemarket.co.uk/",
)

EXTRACT_JS = """
() => {
  const cards = [...document.querySelectorAll(
    'article, .vehicle-card, .listing-card, .search-result, .lot-card, .vehicle, [class*="Vehicle"], [class*="listing"]'
  )];
  const rows = [];
  const seen = new Set();
  for (const card of cards) {
    const text = (card.innerText || '').replace(/\\s+/g, ' ').trim();
    if (text.length < 20) continue;
    if (!/\\b(19|20)\\d{2}\\b/.test(text) && !/£/.test(text)) continue;
    const link = card.querySelector('a[href*="vehicle"], a[href*="lot"], a[href*="/v/"], a[href*="detail"]')
      || card.querySelector('a[href]');
    const href = link ? link.href : '';
    const img = card.querySelector('img');
    const image = img ? (img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || '') : '';
    if (!image || image.startsWith('data:')) continue;
    const idMatch =
      href.match(/\\/(\\d{4,})\\/?$/) ||
      href.match(/[?&](?:id|lot|vehicle)=([A-Za-z0-9_-]+)/i) ||
      text.match(/Lot\\s*#?\\s*([A-Za-z0-9_-]{4,})/i);
    const id = idMatch ? idMatch[1] : href.split('/').filter(Boolean).pop() || '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const titleEl = card.querySelector('h1, h2, h3, h4, .title, a');
    let title = ((titleEl && titleEl.textContent) || '').trim();
    if (!/^\\d{4}\\s+/.test(title)) {
      const m = text.match(/\\b((?:19|20)\\d{2}\\s+[A-Za-z][^£\\n]{2,50})/);
      title = m ? m[1].trim() : title;
    }
    rows.push({ id, url: href, title, image, text });
  }
  return rows;
}
"""


async def scrape_salvage_market(
    *,
    max_pages: int = 8,
    headless: bool = True,
    timeout_ms: int = 60000,
    browser: Browser | None = None,
    page: Page | None = None,
) -> list[dict[str, Any]]:
    session = TabSession()
    tab = await session.start(page=page, browser=browser, headless=headless)
    lots: list[dict[str, Any]] = []
    seen: set[str] = set()

    try:
        opened = False
        for url in SEARCH_URLS:
            try:
                logger.info("salvage_market → %s", url)
                await tab.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                await tab.wait_for_timeout(2500)
                for sel in (
                    "#onetrust-accept-btn-handler",
                    "button:has-text('Accept')",
                    "button:has-text('Agree')",
                ):
                    try:
                        btn = tab.locator(sel).first
                        if await btn.count() and await btn.is_visible():
                            await btn.click(timeout=2500)
                            break
                    except Exception:
                        pass
                opened = True
                break
            except Exception as exc:
                logger.warning("salvage_market open failed %s: %s", url, exc)

        if not opened:
            return [{"_blocked": True, "reason": "navigation_failed"}]

        blocked = await tab.evaluate(
            """() => {
              const t = (document.body && document.body.innerText) || '';
              if (/captcha|access denied|cloudflare/i.test(t)) return 'bot_wall';
              return '';
            }"""
        )
        if blocked == "bot_wall":
            logger.error("salvage_market blocked: %s", blocked)
            return [{"_blocked": True, "reason": blocked}]

        # Prefer Just Added list if we landed on homepage / generic Search.
        if "quickSearch=4" not in (tab.url or ""):
            for sel in ("button:has-text('Just Added')", "a:has-text('Just Added')"):
                try:
                    btn = tab.locator(sel).first
                    if await btn.count() and await btn.is_visible():
                        await btn.click(timeout=4000)
                        await tab.wait_for_timeout(2500)
                        break
                except Exception:
                    pass

        for page_idx in range(max_pages):
            rows = await tab.evaluate(EXTRACT_JS)
            new = 0
            for row in rows or []:
                key = str(row.get("id") or "")
                if not key or key in seen:
                    continue
                seen.add(key)
                lots.append(row)
                new += 1
            logger.info("salvage_market page %s: +%s (store=%s)", page_idx + 1, new, len(lots))

            if page_idx + 1 >= max_pages:
                break
            moved = False
            for sel in (
                "button:has-text('Next page')",
                "a[aria-label='Next page']",
                "button[aria-label='Next page']",
                "a[aria-label='Next']",
                "button[aria-label='Next']",
                "a:has-text('Next')",
                "button:has-text('Next')",
                ".pagination a.next",
            ):
                try:
                    loc = tab.locator(sel).first
                    if await loc.count() and await loc.is_visible():
                        disabled = await loc.get_attribute("aria-disabled")
                        if disabled == "true":
                            continue
                        await loc.click(timeout=4000)
                        await tab.wait_for_timeout(2200)
                        moved = True
                        break
                except Exception:
                    continue
            if not moved or new == 0:
                break

        if not lots:
            logger.warning("salvage_market: no listings found")
        else:
            logger.info("salvage_market done: %s lots", len(lots))
        return lots
    finally:
        await session.close()
