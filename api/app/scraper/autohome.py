"""Autohome Global (China used-car export) — https://global.autohome.com/en

Public listing API: globalapi.che168.com/api/v1/search
Detail pages: https://global.autohome.com/en/detail/{infoid}

Scraped from a warm Playwright tab so cookies / CORS match the site.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any
from urllib.parse import urlencode

from playwright.async_api import Browser, Page

from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.autohome")

WARM_URL = "https://global.autohome.com/en/used-cars"
API_BASE = "https://globalapi.che168.com/api/v1/search"
APP_ID = "global.pc"


def _device_id() -> str:
    return str(uuid.uuid4())


def _search_url(*, page_index: int, page_size: int, device_id: str) -> str:
    qs = urlencode(
        {
            "_appid": APP_ID,
            "deviceid": device_id,
            "language": "en",
            "fromsource": "0",
            "pageindex": str(page_index),
            "pagesize": str(page_size),
            "sort": "0",
            "vehicle_list": "1",
        }
    )
    return f"{API_BASE}?{qs}"


async def scrape_autohome(
    *,
    max_pages: int = 5,
    page_size: int = 24,
    headless: bool = True,
    timeout_ms: int = 60000,
    browser: Browser | None = None,
    page: Page | None = None,
) -> list[dict[str, Any]]:
    """Fetch used-car rows from Autohome Global search API."""
    session = TabSession()
    tab = await session.start(page=page, browser=browser, headless=headless)
    assert session.context is not None
    context = session.context
    lots: list[dict[str, Any]] = []
    seen: set[str] = set()
    device_id = _device_id()
    page_size = max(1, min(int(page_size or 24), 48))

    try:
        await tab.goto(WARM_URL, wait_until="domcontentloaded", timeout=timeout_ms)
        await tab.wait_for_timeout(1500)

        for page_idx in range(max(1, max_pages)):
            api_url = _search_url(
                page_index=page_idx + 1,
                page_size=page_size,
                device_id=device_id,
            )
            try:
                payload = await tab.evaluate(
                    """async (apiUrl) => {
                      const res = await fetch(apiUrl, {
                        credentials: 'include',
                        headers: {
                          'Accept': 'application/json, text/plain, */*',
                          'Referer': 'https://global.autohome.com/',
                          'Origin': 'https://global.autohome.com',
                        },
                      });
                      if (!res.ok) {
                        return { __error: res.status, __body: await res.text() };
                      }
                      return await res.json();
                    }""",
                    api_url,
                )
            except Exception as exc:
                logger.warning("autohome page %s evaluate failed: %s", page_idx, exc)
                try:
                    resp = await context.request.get(
                        api_url,
                        headers={
                            "Accept": "application/json, text/plain, */*",
                            "Referer": "https://global.autohome.com/",
                            "Origin": "https://global.autohome.com",
                        },
                        timeout=timeout_ms,
                    )
                    if not resp.ok:
                        logger.warning("autohome page %s HTTP %s", page_idx, resp.status)
                        if page_idx == 0:
                            return [{"_blocked": True, "reason": f"autohome_http_{resp.status}"}]
                        break
                    payload = await resp.json()
                except Exception as exc2:
                    logger.warning("autohome page %s request failed: %s", page_idx, exc2)
                    if page_idx == 0:
                        return [{"_blocked": True, "reason": f"autohome_fetch:{exc2}"}]
                    break

            if isinstance(payload, dict) and payload.get("__error"):
                status = payload.get("__error")
                logger.warning(
                    "autohome page %s blocked status=%s body=%s",
                    page_idx,
                    status,
                    str(payload.get("__body") or "")[:200],
                )
                if page_idx == 0:
                    return [{"_blocked": True, "reason": f"autohome_http_{status}"}]
                break

            result = payload.get("result") if isinstance(payload, dict) else None
            rows: list[Any] = []
            if isinstance(result, dict):
                rows = result.get("carlist") or result.get("carList") or []
            elif isinstance(payload, dict):
                rows = payload.get("carlist") or payload.get("carList") or []

            if not isinstance(rows, list) or not rows:
                logger.info("autohome page %s empty", page_idx)
                break

            added = 0
            for row in rows:
                if not isinstance(row, dict):
                    continue
                lid = str(row.get("infoid") or row.get("infoId") or row.get("id") or "").strip()
                if not lid or lid in seen:
                    continue
                seen.add(lid)
                # Normalize for mapper
                row.setdefault("id", lid)
                row.setdefault("lotNumber", lid)
                row.setdefault(
                    "lotUrl",
                    f"https://global.autohome.com/en/detail/{lid}",
                )
                lots.append(row)
                added += 1

            total = None
            if isinstance(result, dict):
                total = result.get("totalcount") or result.get("totalCount")
            logger.info(
                "autohome page %s: +%s (total %s%s)",
                page_idx,
                added,
                len(lots),
                f", api_total={total}" if total is not None else "",
            )
            if added == 0:
                break

        return lots
    finally:
        await session.close()
