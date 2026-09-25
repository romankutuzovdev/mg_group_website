"""Copart UK — newly listed / search via Playwright (Incapsula-aware)."""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Browser, Page

from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.copart_uk")

SEARCH_URL = "https://www.copart.co.uk/public/lots/search-results"
WARM_URL = "https://www.copart.co.uk/lotSearchResults/?free=true&query=*"

EXTRACT_DOM_JS = """
() => {
  const cards = [...document.querySelectorAll(
    '[data-uname*="lot"], .lotsearch-lot, tr.ng-star-inserted, .p-datatable-row, article, .search_result_lot'
  )];
  const rows = [];
  for (const card of cards) {
    const text = (card.innerText || '').replace(/\\s+/g, ' ').trim();
    if (!/\\b(19|20)\\d{2}\\b/.test(text)) continue;
    const link = card.querySelector('a[href*="/lot/"]');
    const href = link ? link.href : '';
    const idMatch = href.match(/\\/lot\\/(\\d+)/i) || text.match(/Lot\\s*#?\\s*(\\d{5,})/i);
    const id = idMatch ? idMatch[1] : '';
    const img = card.querySelector('img');
    const image = img ? (img.src || img.getAttribute('data-src') || '') : '';
    const titleEl = card.querySelector('a[href*="/lot/"], .lot-title, h2, h3');
    let title = ((titleEl && titleEl.textContent) || '').trim();
    if (!title) {
      const m = text.match(/\\b((?:19|20)\\d{2}\\s+[A-Z][^£]{3,50})/i);
      title = m ? m[1].trim() : '';
    }
    if (!id || !image) continue;
    rows.push({ id, ln: id, url: href, title, image, text });
  }
  return rows;
}
"""


def _page_body(page: int, size: int) -> dict[str, Any]:
    return {
        "query": ["*"],
        "filter": {},
        "sort": ["auction_date_utc desc"],
        "page": page,
        "size": size,
        "start": page * size,
        "watchListOnly": False,
        "freeFormSearch": False,
        "hideImages": False,
        "defaultSort": False,
        "searchName": "",
        "includeTagByField": {},
    }


async def scrape_copart_uk(
    *,
    max_pages: int = 8,
    page_size: int = 100,
    headless: bool = True,
    timeout_ms: int = 60000,
    browser: Browser | None = None,
    page: Page | None = None,
) -> list[dict[str, Any]]:
    session = TabSession()
    tab = await session.start(page=page, browser=browser, headless=headless)
    assert session.context is not None
    context = session.context
    lots: list[dict[str, Any]] = []
    seen: set[str] = set()

    try:
        logger.info("copart_uk → warm %s", WARM_URL)
        await tab.goto(WARM_URL, wait_until="domcontentloaded", timeout=timeout_ms)
        for sel in ("#onetrust-accept-btn-handler", "button:has-text('Accept All Cookies')"):
            try:
                btn = tab.locator(sel).first
                if await btn.count() and await btn.is_visible():
                    await btn.click(timeout=3000)
                    break
            except Exception:
                pass
        await tab.wait_for_timeout(2500)

        blocked = await tab.evaluate(
            """() => {
              const t = (document.body && document.body.innerText) || '';
              const html = document.documentElement ? document.documentElement.innerHTML : '';
              if (/_Incapsula_Resource|pardon our interruption|additional security/i.test(html))
                return 'incapsula';
              if (/i am human|hcaptcha|access denied/i.test(t + html)) return 'bot_wall';
              return '';
            }"""
        )
        if blocked:
            logger.error(
                "copart_uk blocked by %s — use headed Chrome + SCRAPER_CDP_URL on Windows",
                blocked,
            )
            return [{"_blocked": True, "reason": blocked}]

        api_ok = False
        for page_idx in range(max_pages):
            body = _page_body(page_idx, page_size)
            try:
                resp = await context.request.post(
                    SEARCH_URL,
                    data=body,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Origin": "https://www.copart.co.uk",
                        "Referer": "https://www.copart.co.uk/lotSearchResults/",
                    },
                    timeout=timeout_ms,
                )
            except Exception as exc:
                logger.warning("copart_uk API page %s failed: %s", page_idx, exc)
                break

            if not resp.ok:
                logger.warning("copart_uk API HTTP %s — fallback DOM", resp.status)
                break

            try:
                payload = await resp.json()
            except Exception:
                logger.warning("copart_uk API non-JSON — fallback DOM")
                break

            content = (
                (((payload or {}).get("data") or {}).get("results") or {}).get("content")
                or []
            )
            if not content:
                break

            api_ok = True
            new = 0
            for row in content:
                ln = str(row.get("ln") or row.get("lotNumberStr") or "")
                if not ln or ln in seen:
                    continue
                seen.add(ln)
                lots.append(row)
                new += 1
            logger.info("copart_uk API page %s: +%s (store=%s)", page_idx, new, len(lots))
            if new == 0:
                break

        if not api_ok:
            logger.info("copart_uk → DOM scrape")
            try:
                await tab.wait_for_timeout(2000)
                for page_idx in range(max_pages):
                    rows = await tab.evaluate(EXTRACT_DOM_JS)
                    new = 0
                    for row in rows or []:
                        key = str(row.get("id") or "")
                        if not key or key in seen:
                            continue
                        seen.add(key)
                        lots.append(row)
                        new += 1
                    logger.info("copart_uk DOM page %s: +%s", page_idx + 1, new)
                    if new == 0:
                        break
                    nxt = tab.locator(
                        "a[aria-label='Next'], button[aria-label='Next'], a:has-text('Next')"
                    ).first
                    if await nxt.count() and await nxt.is_visible():
                        await nxt.click(timeout=4000)
                        await tab.wait_for_timeout(2000)
                    else:
                        break
            except Exception as exc:
                logger.warning("copart_uk DOM failed: %s", exc)

        logger.info("copart_uk done: %s lots", len(lots))
        return lots
    finally:
        await session.close()
