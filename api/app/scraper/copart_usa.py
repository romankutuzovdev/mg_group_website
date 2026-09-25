"""Copart.com USA — newly listed lots via public search API (shared Chrome tab)."""

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
    assert session.context is not None
    context = session.context
    lots: list[dict[str, Any]] = []
    seen: set[str] = set()

    try:
        await tab.goto(WARM_URL, wait_until="domcontentloaded", timeout=timeout_ms)
        for sel in ("#onetrust-accept-btn-handler", "button:has-text('Accept All Cookies')"):
            try:
                btn = tab.locator(sel).first
                if await btn.count() and await btn.is_visible():
                    await btn.click(timeout=3000)
                    break
            except Exception:
                pass
        await tab.wait_for_timeout(1500)

        for page_idx in range(max_pages):
            body = _page_body(page_idx, page_size)
            try:
                resp = await context.request.post(
                    SEARCH_URL,
                    data=body,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Origin": "https://www.copart.com",
                        "Referer": "https://www.copart.com/lotSearchResults/",
                    },
                    timeout=timeout_ms,
                )
            except Exception as exc:
                logger.exception("copart search page %s failed: %s", page_idx, exc)
                break

            if not resp.ok:
                logger.warning("copart search HTTP %s on page %s", resp.status, page_idx)
                break

            payload = await resp.json()
            content = (
                (((payload or {}).get("data") or {}).get("results") or {}).get("content")
                or []
            )
            if not content:
                break

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
                "copart page %s: +%s (batch=%s, store=%s, total≈%s)",
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
    finally:
        await session.close()

    return lots
