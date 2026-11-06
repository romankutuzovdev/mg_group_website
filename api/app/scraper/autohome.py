"""Autohome Global (China used-car export) — https://global.autohome.com/en

Public listing API: globalapi.che168.com/api/v1/search
Detail pages: https://global.autohome.com/en/detail/{infoid}

The search only pages honestly through the first ~25k rows: deeper pages return
arbitrary cars, so walking 1..pagecount misses most of the ~237k. Each brand
fits inside that window, so the catalog is walked brand by brand.

Scraped from a warm Playwright tab so cookies / CORS match the site.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlencode

from playwright.async_api import Browser, Page

from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.autohome")

WARM_URL = "https://global.autohome.com/en/used-cars"
API_ROOT = "https://globalapi.che168.com/api/v1"
API_BASE = f"{API_ROOT}/search"
APP_ID = "global.pc"
PAGE_DELAY_SECONDS = 0.5
SORT_PRICE_ASC = "2"
# Rows past this are not reliable (see module docstring).
WINDOW_ROWS = 25000
MAX_FAILED_REQUESTS = 5
RETRY_DELAY_FACTOR = 10

FetchJson = Callable[[str], Awaitable[dict[str, Any]]]


class AutohomeBlocked(Exception):
    """The API refused a request or did not answer."""


def _device_id() -> str:
    return str(uuid.uuid4())


def _search_url(*, page_index: int, page_size: int, device_id: str, brand_id: int) -> str:
    qs = urlencode(
        {
            "_appid": APP_ID,
            "deviceid": device_id,
            "language": "en",
            "fromsource": "0",
            "pageindex": str(page_index),
            "pagesize": str(page_size),
            "sort": SORT_PRICE_ASC,
            "vehicle_list": "1",
            "brandid": str(brand_id),
        }
    )
    return f"{API_BASE}?{qs}"


def _brands_url() -> str:
    return f"{API_ROOT}/brand?{urlencode({'_appid': APP_ID, 'language': 'en'})}"


def _brand_ids(payload: dict[str, Any]) -> list[int]:
    result = payload.get("result") if isinstance(payload, dict) else None
    groups = result.get("brands") if isinstance(result, dict) else None
    return [
        int(brand["bid"])
        for group in groups or []
        for brand in group.get("brand") or []
        if brand.get("bid")
    ]


def _normalize(row: dict[str, Any], lot_id: str) -> dict[str, Any]:
    """Fields the mapper expects."""
    row.setdefault("id", lot_id)
    row.setdefault("lotNumber", lot_id)
    row.setdefault("lotUrl", f"https://global.autohome.com/en/detail/{lot_id}")
    return row


async def walk_catalog(
    fetch: FetchJson,
    on_rows: Callable[[list[dict[str, Any]]], None],
    *,
    max_pages: int = 0,
    page_size: int = 100,
    delay: float = PAGE_DELAY_SECONDS,
) -> int:
    """Walk every brand and hand each page of new cars to `on_rows`.

    Returns how many unique cars were seen. `max_pages` caps total requests.
    A failed page is retried; several failures in a row stop the walk, and an
    unreachable API on the very first call raises AutohomeBlocked.
    """
    brands = _brand_ids(await fetch(_brands_url()))
    if not brands:
        raise AutohomeBlocked("autohome_no_brands")
    device_id = _device_id()
    seen: set[str] = set()
    pages = 0
    failures = 0
    window_pages = WINDOW_ROWS // page_size

    for brand_id in brands:
        page_index = 1
        while True:
            if max_pages and pages >= max_pages:
                return len(seen)
            await asyncio.sleep(delay)
            pages += 1
            url = _search_url(
                page_index=page_index,
                page_size=page_size,
                device_id=device_id,
                brand_id=brand_id,
            )
            try:
                payload = await fetch(url)
            except AutohomeBlocked as exc:
                failures += 1
                logger.warning("autohome brand %s page %s: %s", brand_id, page_index, exc)
                if failures >= MAX_FAILED_REQUESTS:
                    logger.warning("autohome stopped after %s failed requests", failures)
                    return len(seen)
                # Same page again: giving up here would lose the rest of the brand.
                await asyncio.sleep(delay * RETRY_DELAY_FACTOR)
                continue
            failures = 0
            result = payload.get("result") if isinstance(payload, dict) else None
            result = result if isinstance(result, dict) else {}
            rows = result.get("carlist") or result.get("carList") or []
            fresh: list[dict[str, Any]] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                lot_id = str(row.get("infoid") or row.get("infoId") or row.get("id") or "").strip()
                if lot_id and lot_id not in seen:
                    seen.add(lot_id)
                    fresh.append(_normalize(row, lot_id))
            if fresh:
                on_rows(fresh)
            page_count = int(result.get("pagecount") or 0)
            if page_index == 1:
                total = int(result.get("totalcount") or 0)
                logger.info("autohome brand %s: %s cars (seen %s)", brand_id, total, len(seen))
                if total > WINDOW_ROWS:
                    logger.warning(
                        "autohome brand %s has %s cars: only the first %s are reachable",
                        brand_id,
                        total,
                        WINDOW_ROWS,
                    )
            if not rows or page_index >= min(page_count, window_pages):
                break
            page_index += 1
    return len(seen)


async def scrape_autohome(
    *,
    max_pages: int = 0,
    page_size: int = 100,
    headless: bool = True,
    timeout_ms: int = 60000,
    browser: Browser | None = None,
    page: Page | None = None,
    on_chunk: Callable[[list[dict[str, Any]]], None] | None = None,
) -> list[dict[str, Any]]:
    """Fetch used-car rows from Autohome Global search API.

    `max_pages` 0 walks the whole site. With `on_chunk`, each page goes there
    and only a summary is returned: all of che168 must not sit in one list.
    """
    session = TabSession()
    tab = await session.start(page=page, browser=browser, headless=headless)
    assert session.context is not None
    context = session.context
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://global.autohome.com/",
        "Origin": "https://global.autohome.com",
    }

    async def fetch(url: str) -> dict[str, Any]:
        try:
            payload = await tab.evaluate(
                """async ([apiUrl, headers]) => {
                  const res = await fetch(apiUrl, { credentials: 'include', headers });
                  if (!res.ok) {
                    return { __error: res.status, __body: await res.text() };
                  }
                  return await res.json();
                }""",
                [url, headers],
            )
        except Exception as exc:
            logger.warning("autohome evaluate failed: %s", exc)
            try:
                resp = await context.request.get(url, headers=headers, timeout=timeout_ms)
                if not resp.ok:
                    raise AutohomeBlocked(f"autohome_http_{resp.status}")
                payload = await resp.json()
            except AutohomeBlocked:
                raise
            except Exception as exc2:
                raise AutohomeBlocked(f"autohome_fetch:{exc2}") from exc2
        if isinstance(payload, dict) and payload.get("__error"):
            raise AutohomeBlocked(f"autohome_http_{payload.get('__error')}")
        return payload

    lots: list[dict[str, Any]] = []
    try:
        await tab.goto(WARM_URL, wait_until="domcontentloaded", timeout=timeout_ms)
        await tab.wait_for_timeout(1500)
        try:
            fetched = await walk_catalog(
                fetch,
                on_chunk or lots.extend,
                max_pages=max_pages,
                page_size=max(1, min(int(page_size or 100), 100)),
            )
        except AutohomeBlocked as exc:
            return [{"_blocked": True, "reason": str(exc)}]
        if on_chunk:
            return [{"_ok": True, "unique": fetched}] if fetched else []
        return lots
    finally:
        await session.close()
