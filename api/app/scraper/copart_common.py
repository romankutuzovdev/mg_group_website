"""Copart USA / UK search that matches the live site.

Incapsula blocks Playwright's context.request. The search and the photo API
must run as fetch() inside the already open Chrome tab.

Upcoming cars only: auction_date_utc from today forward, automobiles, not sold.
Every lot then gets the full lotImages gallery (highResUrl), not one thumb.
"""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Page

logger = logging.getLogger("mg.scraper.copart")

# Vehicles still scheduled to sell. NOW/DAY is Copart Solr syntax.
UPCOMING_FILTER = {
    "MISC": [
        "auction_date_utc:[NOW/DAY TO *]",
        "#VehicleTypeCode:VEHTYPE_V",
    ]
}

INPAGE_SEARCH_JS = """
async ({ url, body }) => {
  try {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return {
      ok: r.ok,
      status: r.status,
      textHead: text.slice(0, 240),
      json,
    };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e) };
  }
}
"""

# imagesList.content is the full gallery (verified: 15/15 on a live US lot).
FETCH_GALLERIES_JS = """
async ({ origin, lotNumbers }) => {
  const out = {};
  for (const lotNumber of lotNumbers) {
    const urls = [];
    try {
      const res = await fetch(origin + '/public/data/lotdetails/solr/lotImages/' + lotNumber, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) { out[String(lotNumber)] = []; continue; }
      const data = await res.json();
      const list = (((data || {}).data || {}).imagesList) || {};
      const arr = Array.isArray(list.content) ? list.content
        : Array.isArray(list.IMAGE) ? list.IMAGE : [];
      for (const item of arr) {
        const u = (item && (item.highResUrl || item.fullUrl || item.thumbnailUrl)) || '';
        if (typeof u === 'string' && u.startsWith('http')) urls.push(u.split('?')[0]);
      }
    } catch (e) {}
    out[String(lotNumber)] = [...new Set(urls)];
  }
  return out;
}
"""

EXTRACT_DOM_JS = """
() => {
  const cards = [...document.querySelectorAll(
    '[data-uname*="lot"], .search_result_lot, a[href*="/lot/"]'
  )];
  const rows = [];
  const seen = new Set();
  const links = [...document.querySelectorAll('a[href*="/lot/"]')];
  for (const link of links) {
    const href = link.href || '';
    const idMatch = href.match(/\\/lot\\/(\\d+)/i);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (seen.has(id)) continue;
    const card = link.closest('tr, article, [class*="lot"], .p-datatable-row') || link.parentElement;
    const text = ((card && card.innerText) || link.textContent || '').replace(/\\s+/g, ' ').trim();
    const img = card && card.querySelector('img');
    const image = img ? (img.currentSrc || img.src || img.getAttribute('data-src') || '') : '';
    let title = (link.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!/\\b(19|20)\\d{2}\\b/.test(title)) {
      const m = text.match(/\\b((?:19|20)\\d{2}\\s+[A-Za-z0-9][^£$]{2,60})/);
      title = m ? m[1].trim() : title;
    }
    if (!image || !image.startsWith('http')) continue;
    seen.add(id);
    rows.push({ id, ln: id, url: href, title, image, text, _dom: true });
  }
  return rows;
}
"""


def search_body(page: int, size: int) -> dict[str, Any]:
    return {
        "query": ["*"],
        "filter": UPCOMING_FILTER,
        "sort": ["auction_date_utc asc"],
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


def _lot_number(row: dict[str, Any]) -> str:
    return str(row.get("ln") or row.get("lotNumberStr") or row.get("id") or "").strip()


async def _accept_cookies(tab: Page) -> None:
    for sel in (
        "#onetrust-accept-btn-handler",
        "button:has-text('Accept All Cookies')",
        "button:has-text('Accept All')",
    ):
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
              const html = document.documentElement ? document.documentElement.innerHTML : '';
              const hasLots = !!document.querySelector('a[href*="/lot/"]');
              if (hasLots) return '';
              if (/_Incapsula_Resource|pardon our interruption|additional security/i.test(html))
                return 'incapsula';
              if (/i am human|hcaptcha|access denied/i.test(html)) return 'bot_wall';
              return '';
            }"""
        )
    except Exception:
        return ""


async def _attach_galleries(tab: Page, rows: list[dict[str, Any]], *, origin: str) -> None:
    numbers = [_lot_number(row) for row in rows if _lot_number(row)]
    if not numbers:
        return
    merged: dict[str, list[str]] = {}
    chunk = 12
    for start in range(0, len(numbers), chunk):
        part = numbers[start : start + chunk]
        try:
            batch = await tab.evaluate(
                FETCH_GALLERIES_JS,
                {"origin": origin, "lotNumbers": part},
            )
        except Exception as exc:
            logger.warning("copart galleries %s: %s", origin, exc)
            continue
        if isinstance(batch, dict):
            for key, urls in batch.items():
                if isinstance(urls, list):
                    merged[str(key)] = [str(u) for u in urls if str(u).startswith("http")]
    for row in rows:
        ln = _lot_number(row)
        urls = merged.get(ln) or []
        if urls:
            row["images"] = urls
            row.setdefault("tims", urls[0])
            row.setdefault("image", urls[0])


async def scrape_copart_inventory(
    tab: Page,
    *,
    origin: str,
    warm_url: str,
    max_pages: int,
    page_size: int,
    timeout_ms: int,
) -> list[dict[str, Any]]:
    """Return upcoming automobile rows with full image lists."""
    lots: list[dict[str, Any]] = []
    seen: set[str] = set()
    search_url = f"{origin.rstrip('/')}/public/lots/search-results"

    await tab.goto(warm_url, wait_until="domcontentloaded", timeout=timeout_ms)
    await _accept_cookies(tab)
    await tab.wait_for_timeout(2500)

    blocked = await _page_blocked(tab)
    if blocked:
        logger.warning("copart %s blocked: %s", origin, blocked)
        return [{"_blocked": True, "reason": blocked}]

    api_ok = False
    for page_idx in range(max_pages):
        try:
            result = await tab.evaluate(
                INPAGE_SEARCH_JS,
                {"url": search_url, "body": search_body(page_idx, page_size)},
            )
        except Exception as exc:
            logger.warning("copart search page %s failed: %s", page_idx, exc)
            break
        if not isinstance(result, dict) or not result.get("ok"):
            logger.warning(
                "copart search HTTP %s %s",
                result.get("status") if isinstance(result, dict) else "?",
                (result.get("textHead") if isinstance(result, dict) else "")[:120],
            )
            head = str((result or {}).get("textHead") or "").lower() if isinstance(result, dict) else ""
            if "incapsula" in head or "captcha" in head:
                return [{"_blocked": True, "reason": "incapsula"}]
            break

        payload = result.get("json") or {}
        if int(payload.get("returnCode") or 0) not in {0, 1} and not payload.get("data"):
            logger.warning("copart search return %s", payload.get("returnCodeDesc"))
            break
        content = (((payload.get("data") or {}).get("results") or {}).get("content")) or []
        if not content:
            break
        api_ok = True
        page_rows: list[dict[str, Any]] = []
        for row in content:
            if not isinstance(row, dict):
                continue
            ln = _lot_number(row)
            if not ln or ln in seen:
                continue
            dyn = row.get("dynamicLotDetails") or {}
            if dyn.get("lotSold") is True:
                continue
            seen.add(ln)
            page_rows.append(row)
        await _attach_galleries(tab, page_rows, origin=origin)
        lots.extend(page_rows)
        total = ((payload.get("data") or {}).get("results") or {}).get("totalElements")
        logger.info(
            "copart %s page %s: +%s photos≈%s total≈%s",
            origin,
            page_idx,
            len(page_rows),
            sum(len(r.get("images") or []) for r in page_rows),
            total,
        )
        if not page_rows:
            break
        if total is not None and (page_idx + 1) * page_size >= int(total):
            break

    if api_ok:
        return lots

    logger.info("copart %s → DOM fallback", origin)
    try:
        rows = await tab.evaluate(EXTRACT_DOM_JS)
    except Exception as exc:
        logger.warning("copart DOM failed: %s", exc)
        return [{"_blocked": True, "reason": "empty"}]
    page_rows = []
    for row in rows or []:
        ln = _lot_number(row)
        if not ln or ln in seen:
            continue
        seen.add(ln)
        page_rows.append(row)
    await _attach_galleries(tab, page_rows, origin=origin)
    if not page_rows:
        return [{"_blocked": True, "reason": "empty_dom"}]
    return page_rows
