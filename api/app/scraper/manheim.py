"""Manheim USA — newly listed inventory via OneSearch (API / DOM).

Manheim inventory is dealer-login gated. Without an authenticated session
(SCRAPER_CDP_URL to a logged-in Chrome, or SCRAPER_MANHEIM_BEARER_TOKEN)
the scraper reports `_blocked: login_required`.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from playwright.async_api import Browser, Page, Response

from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.manheim")

# OneSearch results sorted by newly listed (firstTimeListed + createdAt).
SEARCH_URL = (
    "https://search.manheim.com/results"
    "?deeplink=/?sort=newlyListed&filters=NewlyListedVehicles~true"
)
WARM_URL = "https://publicauction.manheim.com/"
REST_SEARCH_URL = "https://api.manheim.com/searches"
GRAPHQL_URL = "https://onesearch-api.manheim.com/graphql"

REST_HEADERS = {
    "Accept": "application/vnd.manheim.v11+json",
    "Content-Type": "application/vnd.manheim.v11+json",
    "Origin": "https://search.manheim.com",
    "Referer": "https://search.manheim.com/",
}

LISTING_FIELDS = [
    "id",
    "unifiedId",
    "year",
    "make",
    "model",
    "trim",
    "vin",
    "odometer",
    "askingPrice",
    "buyNowPrice",
    "startingBidPrice",
    "highBid",
    "currency",
    "imageUrl",
    "images",
    "thumbnailUrl",
    "location",
    "facilitationLocation",
    "auctionStartTime",
    "auctionEndTime",
    "createdAt",
    "firstTimeListed",
    "titleType",
    "titleState",
    "exteriorColor",
    "transmission",
    "engineDescription",
    "driveTrain",
    "fuelType",
    "bodyStyle",
    "hasKeys",
    "frameDamage",
    "conditionGrade",
    "href",
    "vdpUrl",
    "detailUrl",
]

EXTRACT_CARDS_JS = """
() => {
  const cards = [
    ...document.querySelectorAll(
      '[data-test-id*="listing"], [data-testid*="listing"], .card-view, .list-view__item, article'
    ),
  ];
  const rows = [];
  for (const card of cards) {
    const text = (card.innerText || '').replace(/\\s+/g, ' ').trim();
    if (!/\\b(19|20)\\d{2}\\b/.test(text)) continue;
    const titleEl = card.querySelector(
      '.ListingTitle__title, [data-test-id*="title"], h2, h3, a'
    );
    const title = ((titleEl && titleEl.textContent) || '').trim();
    const link = card.querySelector('a[href*="listing"], a[href*="Vehicle"], a[href*="vdp"]');
    const href = link ? link.href : '';
    const img = card.querySelector('img');
    const image = img ? (img.src || img.getAttribute('data-src') || '') : '';
    const idMatch =
      href.match(/listing[\\/=]([A-Za-z0-9_-]+)/i) ||
      href.match(/unifiedId[\\/=]([A-Za-z0-9_-]+)/i) ||
      text.match(/\\bID[:\\s#]*([A-Za-z0-9_-]{6,})/i);
    const id = idMatch ? idMatch[1] : '';
    if (!id && !title) continue;
    rows.push({ id, url: href, title, image, text });
  }
  return rows;
}
"""

GET_SEARCHES_QUERY = """
query getSearches($payload: String!, $environment: String!) {
  getSearches(payload: $payload, environment: $environment) {
    compressed
    stringifiedJSON
    isLaneAlert
    isForYou
  }
}
"""


def _rest_body(*, page: int, page_size: int) -> dict[str, Any]:
    return {
        "from": page * page_size,
        "pageSize": page_size,
        "sort": "firstTimeListed:desc,createdAt:desc,sellerRating:desc",
        "newlyListed": 1,
        "includeAllFields": True,
        "includeFilters": False,
        "includeFacets": False,
        "fields": LISTING_FIELDS,
    }


def _graphql_payload(*, page: int, page_size: int) -> dict[str, Any]:
    search = _rest_body(page=page, page_size=page_size)
    return {
        "query": GET_SEARCHES_QUERY,
        "variables": {
            "payload": json.dumps(search, separators=(",", ":")),
            "environment": "prod",
        },
    }


def _looks_like_listing(obj: dict[str, Any]) -> bool:
    if not isinstance(obj, dict):
        return False
    has_id = bool(obj.get("id") or obj.get("unifiedId") or obj.get("listingId"))
    has_ymm = bool(obj.get("year") and (obj.get("make") or obj.get("model")))
    has_vin = bool(obj.get("vin"))
    return has_id and (has_ymm or has_vin)


def _extract_listings(payload: Any) -> list[dict[str, Any]]:
    """Pull listing dicts from REST / GraphQL / nested OneSearch JSON."""
    found: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(item: dict[str, Any]) -> None:
        if not _looks_like_listing(item):
            return
        key = str(item.get("id") or item.get("unifiedId") or item.get("vin") or "")
        if not key or key in seen:
            return
        seen.add(key)
        found.append(item)

    def walk(node: Any, depth: int = 0) -> None:
        if depth > 8 or node is None:
            return
        if isinstance(node, dict):
            if _looks_like_listing(node):
                add(node)
            # GraphQL wrapper: stringifiedJSON
            raw = node.get("stringifiedJSON")
            if isinstance(raw, str) and raw.strip().startswith(("{", "[")):
                try:
                    walk(json.loads(raw), depth + 1)
                except Exception:
                    pass
            for key in ("items", "listings", "results", "content", "data", "hits"):
                if key in node:
                    walk(node[key], depth + 1)
            for v in node.values():
                if isinstance(v, (dict, list)):
                    walk(v, depth + 1)
        elif isinstance(node, list):
            for x in node[:500]:
                walk(x, depth + 1)

    walk(payload)
    return found


async def _page_blocked(page: Page) -> str:
    return await page.evaluate(
        """() => {
          const url = location.href || '';
          const t = (document.body && document.body.innerText) || '';
          if (/locations\\.html|\\/login|auth\\.manheim|sign.?in/i.test(url))
            return 'login_required';
          if (/sign in|log in to continue|dealer login|authorization is required/i.test(t))
            return 'login_required';
          if (/i am human|imperva|hcaptcha|additional security check/i.test(t))
            return 'imperva_hcaptcha';
          return '';
        }"""
    )


async def scrape_manheim_usa(
    *,
    max_pages: int = 5,
    page_size: int = 50,
    headless: bool = True,
    timeout_ms: int = 60000,
    browser: Browser | None = None,
    page: Page | None = None,
    bearer_token: str | None = None,
    cdp_url: str | None = None,
) -> list[dict[str, Any]]:
    """Return raw Manheim listing rows (newly listed) via shared Chrome tab."""
    session = TabSession()
    tab = await session.start(page=page, browser=browser, headless=headless, cdp_url=cdp_url)
    assert session.context is not None
    context = session.context
    captured: list[dict[str, Any]] = []
    seen: set[str] = set()

    async def on_response(resp: Response) -> None:
        url = resp.url.lower()
        if resp.request.resource_type not in ("xhr", "fetch") and "json" not in (
            resp.headers.get("content-type") or ""
        ):
            if not any(x in url for x in ("search", "listing", "graphql", "onesearch")):
                return
        try:
            if resp.status >= 400:
                return
            ct = resp.headers.get("content-type") or ""
            if "json" not in ct and "javascript" not in ct:
                return
            data = await resp.json()
        except Exception:
            return
        for row in _extract_listings(data):
            key = str(row.get("id") or row.get("unifiedId") or "")
            if key and key not in seen:
                seen.add(key)
                captured.append(row)

    tab.on("response", on_response)

    try:
        logger.info("manheim → warm %s", WARM_URL)
        await tab.goto(WARM_URL, wait_until="domcontentloaded", timeout=timeout_ms)
        await tab.wait_for_timeout(1500)

        token = (bearer_token or "").strip()
        if token:
            auth_headers = {
                **REST_HEADERS,
                "Authorization": f"Bearer {token}",
            }
            for page_idx in range(max_pages):
                body = _rest_body(page=page_idx, page_size=page_size)
                try:
                    resp = await context.request.post(
                        REST_SEARCH_URL,
                        data=body,
                        headers=auth_headers,
                        timeout=timeout_ms,
                    )
                    if resp.ok:
                        payload = await resp.json()
                        batch = _extract_listings(payload)
                        new = 0
                        for row in batch:
                            key = str(row.get("id") or row.get("unifiedId") or "")
                            if key and key not in seen:
                                seen.add(key)
                                captured.append(row)
                                new += 1
                        logger.info(
                            "manheim REST page %s: +%s (store=%s)",
                            page_idx,
                            new,
                            len(captured),
                        )
                        if new == 0:
                            break
                        continue
                    logger.warning("manheim REST HTTP %s", resp.status)
                except Exception as exc:
                    logger.warning("manheim REST failed: %s", exc)

                try:
                    gql = _graphql_payload(page=page_idx, page_size=page_size)
                    resp = await context.request.post(
                        GRAPHQL_URL,
                        data=gql,
                        headers={
                            "Content-Type": "application/json",
                            "Accept": "application/json",
                            "Authorization": f"Bearer {token}",
                        },
                        timeout=timeout_ms,
                    )
                    if resp.ok:
                        batch = _extract_listings(await resp.json())
                        new = 0
                        for row in batch:
                            key = str(row.get("id") or row.get("unifiedId") or "")
                            if key and key not in seen:
                                seen.add(key)
                                captured.append(row)
                                new += 1
                        logger.info(
                            "manheim GQL page %s: +%s (store=%s)",
                            page_idx,
                            new,
                            len(captured),
                        )
                        if new == 0:
                            break
                    else:
                        logger.warning("manheim GQL HTTP %s", resp.status)
                except Exception as exc:
                    logger.warning("manheim GQL failed: %s", exc)
                    break

            if captured:
                return captured

        logger.info("manheim → %s", SEARCH_URL)
        await tab.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=timeout_ms)
        await tab.wait_for_timeout(4500)

        blocked = await _page_blocked(tab)
        if blocked and not captured:
            logger.error(
                "manheim blocked by %s — log into Manheim in Chrome with "
                "remote debugging and set SCRAPER_CDP_URL, or set "
                "SCRAPER_MANHEIM_BEARER_TOKEN",
                blocked,
            )
            return [{"_blocked": True, "reason": blocked}]

        for sel in (
            "button:has-text('Newly Listed')",
            "a:has-text('Newly Listed')",
            "[data-test-id*='newlyListed']",
            "text=Newly Listed Vehicles",
        ):
            try:
                loc = tab.locator(sel).first
                if await loc.count() and await loc.is_visible():
                    await loc.click(timeout=3000)
                    await tab.wait_for_timeout(2500)
                    logger.info("manheim: clicked Newly Listed")
                    break
            except Exception:
                continue

        await tab.wait_for_timeout(2000)

        if not captured:
            try:
                await tab.wait_for_selector(
                    ".ListingTitle__title, [data-test-id*='listing'], .card-view",
                    timeout=15000,
                )
            except Exception:
                pass
            rows = await tab.evaluate(EXTRACT_CARDS_JS)
            for row in rows or []:
                key = str(row.get("id") or row.get("title") or "")
                if key and key not in seen:
                    seen.add(key)
                    captured.append(row)
            logger.info("manheim DOM cards: %s", len(rows or []))

        for page_idx in range(1, max_pages):
            if len(captured) >= page_size * (page_idx + 1):
                continue
            moved = False
            for sel in (
                "a[aria-label='Next']",
                "button[aria-label='Next']",
                "button:has-text('Next')",
                "a:has-text('Next')",
            ):
                try:
                    loc = tab.locator(sel).first
                    if await loc.count() and await loc.is_visible():
                        disabled = await loc.get_attribute("aria-disabled")
                        if disabled == "true":
                            break
                        before = len(captured)
                        await loc.click(timeout=4000)
                        await tab.wait_for_timeout(2500)
                        rows = await tab.evaluate(EXTRACT_CARDS_JS)
                        for row in rows or []:
                            key = str(row.get("id") or row.get("title") or "")
                            if key and key not in seen:
                                seen.add(key)
                                captured.append(row)
                        moved = len(captured) > before
                        logger.info(
                            "manheim page %s: store=%s (+dom)",
                            page_idx + 1,
                            len(captured),
                        )
                        break
                except Exception:
                    continue
            if not moved:
                break

        if not captured:
            blocked = await _page_blocked(tab) or "no_results"
            logger.warning("manheim: no listings (%s)", blocked)
            if blocked != "no_results":
                return [{"_blocked": True, "reason": blocked}]
            return []

        logger.info("manheim done: %s listings", len(captured))
        return captured
    finally:
        await session.close()
