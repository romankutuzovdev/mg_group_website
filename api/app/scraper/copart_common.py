"""Copart USA / UK search that matches the live site.

Incapsula blocks Playwright's context.request. The search and the photo API
must run as fetch() inside the already open Chrome tab.

Upcoming cars only: auction_date_utc from today forward, automobiles, not sold.
Every lot then gets the full lotImages gallery (highResUrl), not one thumb.
"""

from __future__ import annotations

import asyncio
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

# Yard + body style from lotdetails Solr (same cookies as the scraper tab).
FETCH_LOT_DETAILS_JS = """
async ({ origin, lotNumbers }) => {
  const out = {};
  for (const lotNumber of lotNumbers) {
    try {
      const res = await fetch(origin + '/public/data/lotdetails/solr/' + lotNumber, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) { out[String(lotNumber)] = null; continue; }
      const j = await res.json();
      const d = (j && j.data && (j.data.lotDetails || j.data)) || j || {};
      let loc = d.yn || d.yardName || d.aname || d.facilityName || d.saleLocation || d.loc || null;
      if (loc && typeof loc === 'object') {
        loc = loc.name || loc.yardName || loc.yn || loc.value || null;
      }
      out[String(lotNumber)] = {
        yn: loc,
        bsd: d.bsd || d.vehTypDesc || d.bodyStyle || d.bt || d.vehicleTypeDesc || null,
        td: d.td || d.titleDesc || d.tgd || d.ft || null,
        hb: d.highBid || d.hb || d.currentBid || null,
        orr: d.orr || d.odometer || null,
        mkn: d.mkn || d.make || null,
        lm: d.lm || d.model || d.lmg || null,
        lcy: d.lcy || d.year || null,
      };
    } catch (e) {
      out[String(lotNumber)] = null;
    }
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


async def _dom_state(tab: Page) -> str:
    """lots = search rendered. incapsula = the short challenge page, not the app shell."""
    try:
        return await tab.evaluate(
            """() => {
              const html = document.documentElement ? document.documentElement.innerHTML : '';
              if (document.querySelector('a[href*="/lot/"]')) return 'lots';
              const challenge = /pardon our interruption|additional security check|_Incapsula_Resource/i.test(html);
              if (challenge && html.length < 120000) return 'incapsula';
              if (/i am human|hcaptcha/i.test(html) && html.length < 120000) return 'bot_wall';
              return 'loading';
            }"""
        )
    except Exception:
        return "loading"


async def _settle_page(tab: Page, timeout_ms: int = 15000) -> str:
    """Angular draws lot links a few seconds after domcontentloaded."""
    waited = 0
    state = "loading"
    while waited < timeout_ms:
        state = await _dom_state(tab)
        if state == "lots":
            return state
        await tab.wait_for_timeout(1000)
        waited += 1000
    return state


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


async def _attach_lot_details(tab: Page, rows: list[dict[str, Any]], *, origin: str) -> None:
    """Fill yn (yard) + bsd (body) from Solr lotdetails — needed for UK calculator."""
    numbers = [_lot_number(row) for row in rows if _lot_number(row)]
    if not numbers:
        return
    merged: dict[str, dict[str, Any]] = {}
    chunk = 10
    for start in range(0, len(numbers), chunk):
        part = numbers[start : start + chunk]
        try:
            batch = await tab.evaluate(
                FETCH_LOT_DETAILS_JS,
                {"origin": origin, "lotNumbers": part},
            )
        except Exception as exc:
            logger.warning("copart lot details %s: %s", origin, exc)
            continue
        if isinstance(batch, dict):
            for key, details in batch.items():
                if isinstance(details, dict):
                    merged[str(key)] = details
    filled = 0
    for row in rows:
        ln = _lot_number(row)
        details = merged.get(ln)
        if not details:
            continue
        if details.get("yn") and not row.get("yn"):
            row["yn"] = details["yn"]
        if details.get("bsd") and not row.get("bsd"):
            row["bsd"] = details["bsd"]
        if details.get("td") and not row.get("td"):
            row["td"] = details["td"]
        if details.get("hb") and not row.get("hb"):
            row["hb"] = details["hb"]
        if details.get("orr") and not row.get("orr"):
            row["orr"] = details["orr"]
        if details.get("mkn") and not row.get("mkn"):
            row["mkn"] = details["mkn"]
        if details.get("lm") and not row.get("lm"):
            row["lm"] = details["lm"]
        if details.get("lcy") and not row.get("lcy"):
            row["lcy"] = details["lcy"]
        filled += 1
    logger.info("copart %s lot details filled for %s/%s rows", origin, filled, len(numbers))


# One Copart market at a time. Two parallel gotos in the same Chrome drop the CDP session.
_WALK_LOCK = asyncio.Lock()
# Page-open fallback only for lots where lotImages API returned <2 photos
_LOTS_TO_OPEN = 80


async def _gallery_on_lot_page(tab: Page, origin: str, lot_number: str) -> list[str]:
    try:
        batch = await tab.evaluate(
            FETCH_GALLERIES_JS,
            {"origin": origin, "lotNumbers": [lot_number]},
        )
    except Exception:
        batch = {}
    urls: list[str] = []
    if isinstance(batch, dict):
        raw = batch.get(str(lot_number)) or batch.get(lot_number) or []
        if isinstance(raw, list):
            urls = [str(u) for u in raw if str(u).startswith("http")]
    if urls:
        return urls
    try:
        dom = await tab.evaluate(
            """() => [...document.querySelectorAll('img')]
              .map((img) => img.currentSrc || img.src || '')
              .filter((u) => /copart/i.test(u))"""
        )
    except Exception:
        dom = []
    return [str(u).split("?")[0] for u in (dom or []) if str(u).startswith("http")]


async def _open_lot_pages(
    tab: Page,
    rows: list[dict[str, Any]],
    *,
    origin: str,
    timeout_ms: int,
    limit: int,
) -> int:
    """Open lot cards one by one so photos are taken from the lot page, not only the search."""
    opened = 0
    base = origin.rstrip("/")
    for row in rows:
        if opened >= limit:
            break
        ln = _lot_number(row)
        if not ln:
            continue
        url = str(row.get("url") or f"{base}/lot/{ln}")
        if "/lot/" not in url:
            url = f"{base}/lot/{ln}"
        try:
            logger.info("copart %s opening lot %s", origin, ln)
            await tab.goto(url, wait_until="domcontentloaded", timeout=min(timeout_ms, 45_000))
            await _accept_cookies(tab)
            await tab.wait_for_timeout(600)
            images = await _gallery_on_lot_page(tab, origin, ln)
            if images:
                row["images"] = images
                row.setdefault("tims", images[0])
                row["image"] = images[0]
            opened += 1
        except Exception as exc:
            logger.warning("copart lot %s: %s", ln, exc)
    logger.info("copart %s opened %s lot pages", origin, opened)
    return opened


async def _collect_dom_pages(tab: Page, *, max_pages: int) -> list[dict[str, Any]]:
    """Read lot links from the search table, then the next result pages."""
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page_idx in range(max_pages):
        await _settle_page(tab, 12000)
        try:
            found = await tab.evaluate(EXTRACT_DOM_JS)
        except Exception as exc:
            logger.warning("copart DOM page %s: %s", page_idx, exc)
            break
        added = 0
        for row in found or []:
            if not isinstance(row, dict):
                continue
            ln = _lot_number(row)
            if not ln or ln in seen:
                continue
            seen.add(ln)
            rows.append(row)
            added += 1
        logger.info("copart DOM page %s: +%s links", page_idx, added)
        if added == 0:
            break
        try:
            clicked = await tab.evaluate(
                """() => {
                  const next = document.querySelector(
                    '.p-paginator-next:not(.p-disabled), button[aria-label="Next Page"]:not([disabled])'
                  );
                  if (!next) return false;
                  next.click();
                  return true;
                }"""
            )
        except Exception:
            clicked = False
        if not clicked:
            break
        await tab.wait_for_timeout(1500)
    return rows


async def scrape_copart_inventory(
    tab: Page,
    *,
    origin: str,
    warm_url: str,
    max_pages: int,
    page_size: int,
    timeout_ms: int,
) -> list[dict[str, Any]]:
    """Search Copart, then open each lot page. USA and UK never navigate at the same time."""
    async with _WALK_LOCK:
        return await _scrape_copart_inventory(
            tab,
            origin=origin,
            warm_url=warm_url,
            max_pages=max_pages,
            page_size=page_size,
            timeout_ms=timeout_ms,
        )


async def _scrape_copart_inventory(
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
    state = await _settle_page(tab, 20000)
    logger.info("copart %s page state=%s", origin, state)

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
            head = str((result or {}).get("textHead") or "").lower() if isinstance(result, dict) else ""
            if page_idx == 0 and ("incapsula" in head or "captcha" in head):
                logger.info("copart %s search challenged, retry once", origin)
                await tab.wait_for_timeout(4000)
                await _accept_cookies(tab)
                try:
                    result = await tab.evaluate(
                        INPAGE_SEARCH_JS,
                        {"url": search_url, "body": search_body(page_idx, page_size)},
                    )
                except Exception as exc:
                    logger.warning("copart search retry failed: %s", exc)
                    result = {"ok": False, "textHead": ""}
                head = str((result or {}).get("textHead") or "").lower() if isinstance(result, dict) else ""
            if not isinstance(result, dict) or not result.get("ok"):
                logger.warning(
                    "copart search HTTP %s %s — will read lot links on the page",
                    result.get("status") if isinstance(result, dict) else "?",
                    head[:120],
                )
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
        lots.extend(page_rows)
        total = ((payload.get("data") or {}).get("results") or {}).get("totalElements")
        logger.info(
            "copart %s page %s: +%s total≈%s",
            origin,
            page_idx,
            len(page_rows),
            total,
        )
        if not page_rows:
            break
        if total is not None and (page_idx + 1) * page_size >= int(total):
            break

    if not api_ok:
        logger.info("copart %s reading lot links from the search page", origin)
        for row in await _collect_dom_pages(tab, max_pages=max_pages):
            ln = _lot_number(row)
            if not ln or ln in seen:
                continue
            seen.add(ln)
            lots.append(row)

    if not lots:
        return [{"_blocked": True, "reason": "empty" if state != "incapsula" else "incapsula"}]

    # Yard + body from Solr before galleries (calculator needs these).
    await _attach_lot_details(tab, lots, origin=origin)

    # Full lotImages gallery for EVERY lot (not only 25 page opens).
    await _attach_galleries(tab, lots, origin=origin)
    with_gallery = sum(1 for r in lots if len(r.get("images") or []) >= 2)
    logger.info(
        "copart %s galleries: %s/%s lots with 2+ photos",
        origin,
        with_gallery,
        len(lots),
    )

    # Fallback: open pages only for lots that still lack a multi-photo gallery
    need_open = [
        r for r in lots if len(r.get("images") or []) < 2 and _lot_number(r)
    ]
    if need_open:
        await _open_lot_pages(
            tab,
            need_open,
            origin=origin,
            timeout_ms=timeout_ms,
            limit=min(_LOTS_TO_OPEN, len(need_open)),
        )
    return lots
