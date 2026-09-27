"""Copart.com USA — newly listed lots via in-page fetch (shared Chrome tab).

Important: do NOT use Playwright ``context.request`` — Incapsula returns HTTP 403
for that client. Requests must go through ``page.evaluate(fetch(...))`` so cookies
and TLS fingerprint match the headed Chrome session (same as IAAI DOM scrape).
"""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Browser, Page

from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.copart")

SEARCH_URL = "https://www.copart.com/public/lots/search-results"
WARM_URL = (
    "https://www.copart.com/lotSearchResults/?free=true&query=*&displayStr=*"
    "&searchCriteria=%7B%22query%22%3A%5B%22*%22%5D%2C%22filter%22%3A%7B%22MISC%22%3A%5B"
    "%22%23VehicleTypeCode%3AVEHTYPE_V%22%2C%22%23LotFeatureCode%3AFeatureCode_PriVarT_1%22%5D%7D"
    "%2C%22sort%22%3A%5B%22auction_date_utc%20desc%22%5D%2C%22watchListOnly%22%3Afalse%7D"
)

NEWLY_ADDED_FILTER = {
    "MISC": [
        "#VehicleTypeCode:VEHTYPE_V",
        "#LotFeatureCode:FeatureCode_PriVarT_1",
    ]
}

# Fetch search API inside the real Chrome tab (cookies / Incapsula).
INPAGE_SEARCH_JS = """
async ({ url, body }) => {
  try {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://www.copart.com',
        'Referer': 'https://www.copart.com/lotSearchResults/',
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return {
      ok: r.ok,
      status: r.status,
      ctype: (r.headers.get('content-type') || ''),
      textHead: text.slice(0, 400),
      json,
    };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e) };
  }
}
"""

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
      const m = text.match(/\\b((?:19|20)\\d{2}\\s+[A-Z][^$]{3,50})/i);
      title = m ? m[1].trim() : '';
    }
    if (!id || !image) continue;
    rows.push({ id, ln: id, url: href, title, image, text, _dom: true });
  }
  return rows;
}
"""


def _page_body(page: int, size: int) -> dict[str, Any]:
    return {
        "query": ["*"],
        "filter": NEWLY_ADDED_FILTER,
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


async def _accept_cookies(tab: Page) -> None:
    for sel in ("#onetrust-accept-btn-handler", "button:has-text('Accept All Cookies')"):
        try:
            btn = tab.locator(sel).first
            if await btn.count() and await btn.is_visible():
                await btn.click(timeout=3000)
                break
        except Exception:
            pass


async def _page_blocked(tab: Page) -> str:
    try:
        return await tab.evaluate(
            """() => {
              const t = (document.body && document.body.innerText) || '';
              const html = document.documentElement ? document.documentElement.innerHTML : '';
              if (/_Incapsula_Resource|pardon our interruption|additional security/i.test(html))
                return 'incapsula';
              if (/i am human|hcaptcha|access denied/i.test(t + html)) return 'bot_wall';
              return '';
            }"""
        )
    except Exception:
        return ""


async def scrape_copart_usa(
    *,
    max_pages: int = 10,
    page_size: int = 100,
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
        await tab.goto(WARM_URL, wait_until="domcontentloaded", timeout=timeout_ms)
        await _accept_cookies(tab)
        await tab.wait_for_timeout(2000)

        blocked = await _page_blocked(tab)
        if blocked:
            logger.warning("copart warm page blocked: %s", blocked)
            return [{"_blocked": True, "reason": blocked}]

        api_ok = False
        for page_idx in range(max_pages):
            body = _page_body(page_idx, page_size)
            try:
                result = await tab.evaluate(
                    INPAGE_SEARCH_JS,
                    {"url": SEARCH_URL, "body": body},
                )
            except Exception as exc:
                logger.warning("copart in-page fetch page %s failed: %s", page_idx, exc)
                break

            if not isinstance(result, dict):
                break

            status = int(result.get("status") or 0)
            if not result.get("ok"):
                logger.warning(
                    "copart in-page HTTP %s err=%s — will try DOM",
                    status,
                    result.get("error") or (result.get("textHead") or "")[:120],
                )
                if status in (401, 403, 429) and page_idx == 0 and not lots:
                    # Still try DOM before giving up as blocked
                    break
                break

            payload = result.get("json")
            if not payload:
                head = (result.get("textHead") or "").lower()
                if "incapsula" in head or "captcha" in head:
                    return [{"_blocked": True, "reason": "incapsula"}]
                logger.warning("copart in-page non-JSON — DOM fallback")
                break

            content = (
                (((payload or {}).get("data") or {}).get("results") or {}).get("content")
                or []
            )
            if not content:
                if page_idx == 0 and not lots:
                    break
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

            total = (((payload or {}).get("data") or {}).get("results") or {}).get(
                "totalElements"
            )
            logger.info(
                "copart in-page page %s: +%s (batch=%s, store=%s, total≈%s)",
                page_idx,
                new,
                len(content),
                len(lots),
                total,
            )
            if new == 0:
                break
            if total is not None and (page_idx + 1) * page_size >= int(total):
                break

        if not api_ok:
            logger.info("copart → DOM scrape (API unavailable)")
            try:
                await tab.wait_for_timeout(1500)
                for page_idx in range(max_pages):
                    rows = await tab.evaluate(EXTRACT_DOM_JS)
                    new = 0
                    for row in rows or []:
                        key = str(row.get("id") or row.get("ln") or "")
                        if not key or key in seen:
                            continue
                        seen.add(key)
                        lots.append(row)
                        new += 1
                    logger.info("copart DOM page %s: +%s", page_idx + 1, new)
                    if new == 0 and page_idx == 0:
                        return [{"_blocked": True, "reason": "http_403_or_empty_dom"}]
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
                logger.warning("copart DOM failed: %s", exc)
                if not lots:
                    return [{"_blocked": True, "reason": "http_403"}]

        logger.info("copart done: %s lots", len(lots))
        return lots
    finally:
        await session.close()
