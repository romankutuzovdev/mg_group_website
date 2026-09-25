"""Encar.com (Korea) — used-car listings via public search API inside a warm browser tab.

Encar blocks CloudFront for many non-KR IPs on api.encar.com. Scraping from a
Playwright tab after warming www.encar.com / fem.encar.com reuses browser cookies
and often succeeds where bare curl fails. Prefer a KR proxy via SCRAPER_CDP_URL
or ENCAR_PROXY when running outside Korea.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from playwright.async_api import Browser, Page

from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.encar")

WARM_URL = "https://www.encar.com/dc/dc_carsearchlist.do?carType=kor"
API_URL = "https://api.encar.com/search/car/list/general"

# Domestic passenger cars, newest first
BASE_QUERY = "(And.Hidden.N._.CarType.Y.)"


def _list_url(*, start: int, limit: int) -> str:
    # sr = |sort|start|limit
    sr = quote(f"|ModifiedDate|{start}|{limit}", safe="")
    q = quote(BASE_QUERY, safe="")
    return f"{API_URL}?count=true&q={q}&sr={sr}"


async def scrape_encar(
    *,
    max_pages: int = 10,
    page_size: int = 50,
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
        await tab.wait_for_timeout(2000)

        for page_idx in range(max_pages):
            start = page_idx * page_size
            url = _list_url(start=start, limit=page_size)
            try:
                # Prefer in-page fetch (same cookie jar / TLS fingerprint as browser)
                payload = await tab.evaluate(
                    """async (apiUrl) => {
                      const res = await fetch(apiUrl, {
                        credentials: 'include',
                        headers: {
                          'Accept': 'application/json, text/plain, */*',
                          'Referer': 'https://www.encar.com/',
                        },
                      });
                      if (!res.ok) {
                        return { __error: res.status, __body: await res.text() };
                      }
                      return await res.json();
                    }""",
                    url,
                )
            except Exception as exc:
                logger.warning("encar page %s evaluate failed: %s", page_idx, exc)
                # Fallback: context.request from Playwright
                try:
                    resp = await context.request.get(
                        url,
                        headers={
                            "Accept": "application/json, text/plain, */*",
                            "Referer": "https://www.encar.com/",
                            "Origin": "https://www.encar.com",
                        },
                        timeout=timeout_ms,
                    )
                    if not resp.ok:
                        logger.warning("encar page %s HTTP %s", page_idx, resp.status)
                        break
                    payload = await resp.json()
                except Exception as exc2:
                    logger.warning("encar page %s request failed: %s", page_idx, exc2)
                    break

            if isinstance(payload, dict) and payload.get("__error"):
                status = payload.get("__error")
                logger.warning(
                    "encar page %s blocked status=%s body=%s",
                    page_idx,
                    status,
                    str(payload.get("__body") or "")[:200],
                )
                if page_idx == 0:
                    return [
                        {
                            "_blocked": True,
                            "reason": f"encar_http_{status}",
                        }
                    ]
                break

            rows = []
            if isinstance(payload, dict):
                rows = (
                    payload.get("SearchResults")
                    or payload.get("searchResults")
                    or payload.get("Results")
                    or payload.get("results")
                    or []
                )
            if not isinstance(rows, list) or not rows:
                logger.info("encar page %s empty", page_idx)
                break

            added = 0
            for row in rows:
                if not isinstance(row, dict):
                    continue
                lid = str(row.get("Id") or row.get("id") or "").strip()
                if not lid or lid in seen:
                    continue
                seen.add(lid)
                lots.append(row)
                added += 1

            logger.info("encar page %s: +%s (total %s)", page_idx, added, len(lots))
            if added == 0:
                break

        return lots
    finally:
        await session.close()
