"""IAAI.com USA — newly listed inventory (shared Chrome tab)."""

from __future__ import annotations

import logging
import re
from typing import Any

from playwright.async_api import Browser, Page

from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.iaai")

SEARCH_URL = "https://www.iaai.com/Search?status=Current&status=Future"

EXTRACT_ROWS_JS = """
() => {
  const rows = [...document.querySelectorAll('.table-row.table-row-border')];
  return rows.map((row) => {
    const watch = row.querySelector('[watchinventoryid]');
    const id = watch ? watch.getAttribute('watchinventoryid') : '';
    const link = row.querySelector('a[href*="VehicleDetail"]');
    const href = link ? link.href : '';
    const img = row.querySelector('img');
    const image = img ? (img.src || img.getAttribute('data-src') || '') : '';
    const titleEl = row.querySelector('.heading-7 a, .heading-7, a[href*="VehicleDetail"]');
    let title = '';
    if (titleEl) {
      const t = (titleEl.textContent || '').trim();
      if (/^\\d{4}\\s+/.test(t)) title = t;
    }
    if (!title) {
      const m = (row.innerText || '').match(/\\b(19|20)\\d{2}\\s+[A-Z0-9][^|\\n]{2,60}/);
      title = m ? m[0].trim() : '';
    }
    const cells = [...row.querySelectorAll(':scope > .table-cell, :scope > [class*="table-cell"]')]
      .map((cell) => (cell.innerText || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean);
    const text = cells.length >= 3
      ? cells.join(' | ')
      : (row.innerText || '').replace(/\\s+/g, ' ').trim();
    return { id, url: href, title, image, text };
  }).filter((x) => x.id && x.image);
}
"""


async def _click_new_inventory(page: Page) -> None:
    for sel in (
        "button:has-text('New Inventory')",
        "a:has-text('New Inventory')",
        "[aria-label*='New Inventory']",
        "text=New Inventory",
    ):
        try:
            loc = page.locator(sel).first
            if await loc.count() and await loc.is_visible():
                await loc.click(timeout=4000)
                await page.wait_for_timeout(2000)
                logger.info("iaai: clicked New Inventory")
                return
        except Exception:
            continue
    logger.warning("iaai: New Inventory control not found — scraping current search")


async def _goto_next(page: Page) -> bool:
    for sel in (
        "a[aria-label='Next']",
        "button[aria-label='Next']",
        ".pagination a:has-text('›')",
        ".pagination a:has-text('Next')",
        "a.next",
    ):
        try:
            loc = page.locator(sel).first
            if await loc.count() and await loc.is_visible():
                disabled = await loc.get_attribute("aria-disabled")
                cls = (await loc.get_attribute("class")) or ""
                if disabled == "true" or "disabled" in cls:
                    return False
                await loc.click(timeout=4000)
                await page.wait_for_timeout(1800)
                return True
        except Exception:
            continue
    return False


async def scrape_iaai_usa(
    *,
    max_pages: int = 10,
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
        logger.info("iaai → %s", SEARCH_URL)
        await tab.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=timeout_ms)
        await tab.wait_for_timeout(2500)

        blocked = await tab.evaluate(
            """() => {
              const t = (document.body && document.body.innerText) || '';
              const html = document.documentElement ? document.documentElement.innerHTML : '';
              if (/i am human|imperva|hcaptcha|additional security check/i.test(t + html))
                return 'imperva_hcaptcha';
              if (/access denied|attention required/i.test(t)) return 'access_denied';
              if (!t.trim() && !document.querySelector('a[href*="VehicleDetail"]'))
                return 'empty_page_possible_bot_wall';
              return '';
            }"""
        )
        if blocked:
            logger.error(
                "iaai blocked by %s — open Chrome with remote debugging "
                "and set SCRAPER_CDP_URL=http://127.0.0.1:9223",
                blocked,
            )
            return [{"_blocked": True, "reason": blocked}]

        await _click_new_inventory(tab)
        try:
            await tab.wait_for_selector(".table-row.table-row-border", timeout=20000)
        except Exception:
            logger.warning("iaai: no result rows")
            return []

        for page_idx in range(1, max_pages + 1):
            rows = await tab.evaluate(EXTRACT_ROWS_JS)
            new = 0
            for row in rows or []:
                key = str(row.get("id") or "")
                if not key or key in seen:
                    continue
                seen.add(key)
                lots.append(row)
                new += 1
            logger.info("iaai page %s: +%s (batch=%s, store=%s)", page_idx, new, len(rows or []), len(lots))
            if page_idx >= max_pages:
                break
            if not await _goto_next(tab):
                break
            if new == 0:
                break
    finally:
        await session.close()

    return lots


# Longest phrases first so "rear end" wins over "rear".
_DAMAGE_PHRASES: tuple[str, ...] = tuple(
    sorted(
        {
            "minor dent/scratches",
            "minor dents/scratches",
            "normal wear & tear",
            "normal wear and tear",
            "normal wear",
            "biohazard/chemical",
            "biohazard",
            "water/flood",
            "fresh water",
            "salt water",
            "front & rear",
            "front and rear",
            "cash for clunkers",
            "transmission damage",
            "engine damage",
            "frame damage",
            "storm damage",
            "damage history",
            "partial repair",
            "rejected repair",
            "missing/altered vin",
            "replaced vin",
            "undercarriage",
            "under carriage",
            "top/roof",
            "left front",
            "left rear",
            "left side",
            "right front",
            "right rear",
            "right side",
            "front end",
            "rear end",
            "all over",
            "rollover",
            "mechanical",
            "vandalism",
            "repossession",
            "suspension",
            "electrical",
            "stripped",
            "hail",
            "flood",
            "burn",
            "side",
            "rear",
            "front",
            "roof",
            "theft",
            "unknown",
        },
        key=len,
        reverse=True,
    )
)

_LISTING_BLOB = re.compile(r"stock\s*#:|view all images|pre-?bid or buy now", re.I)


def _title_case(value: str) -> str:
    return " ".join(w[:1].upper() + w[1:].lower() for w in value.split())


def _damage_window(text: str) -> str:
    """Slice between stock number and odometer — that is where IAA puts damage."""
    m = re.search(r"Stock\s*#:\s*[\d*]+\s+(.+?)\s+[\d,]+\s*mi\b", text, re.I)
    if m:
        return m.group(1)
    parts = [p.strip() for p in text.split("|") if p.strip()]
    short = [p for p in parts if len(p) <= 48]
    if len(short) >= 2:
        return " | ".join(short)
    return text


def extract_iaai_damages(text: str) -> tuple[str | None, str | None]:
    window = _damage_window(text)
    occupied = [False] * (len(window) + 1)
    found: list[tuple[int, str]] = []
    for phrase in _DAMAGE_PHRASES:
        for m in re.finditer(rf"\b{re.escape(phrase)}\b", window, re.I):
            if any(occupied[m.start() : m.end()]):
                continue
            for i in range(m.start(), m.end()):
                occupied[i] = True
            found.append((m.start(), _title_case(phrase)))
            break
    found.sort()
    if not found:
        return None, None
    secondary = found[1][1] if len(found) > 1 else None
    return found[0][1], secondary


def _parse_bid_and_acv(text: str) -> tuple[float | None, float | None]:
    acv_m = re.search(r"ACV:\s*\$\s*([\d,]+)", text, re.I)
    acv = float(acv_m.group(1).replace(",", "")) if acv_m else None
    bid_m = re.search(
        r"(?:Buy\s*Now|Current\s*Bid|Pre-?\s*bid)[^$\n]{0,40}\$\s*([\d,]+)",
        text,
        re.I,
    )
    if bid_m:
        return float(bid_m.group(1).replace(",", "")), acv
    bid: float | None = None
    for m in re.finditer(r"\$\s*([\d,]+)\s*USD", text, re.I):
        prefix = text[max(0, m.start() - 16) : m.start()]
        if re.search(r"ACV:\s*$", prefix, re.I):
            continue
        bid = float(m.group(1).replace(",", ""))
    return bid, acv


def _parse_location(text: str) -> str | None:
    for m in re.finditer(
        r"\b([A-Za-z][A-Za-z .'-]{1,40}?)\s*\(\s*([A-Za-z][A-Za-z .]{1,24})\s*\)",
        text,
    ):
        city, state = m.group(1).strip(), m.group(2).strip()
        if city.lower() in {"mi", "km", "usd", "vin"}:
            continue
        if state.lower() in {"actual", "exempt", "not actual", "missing"}:
            continue
        state_fmt = state.upper() if len(state) <= 3 and " " not in state else _title_case(state)
        return f"{_title_case(city)} ({state_fmt})"
    return None


def parse_iaai_text_fields(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    m = re.search(r"([\d,]+)\s*mi\b", text, re.I)
    if m:
        out["odometer"] = int(m.group(1).replace(",", ""))
    bid, acv = _parse_bid_and_acv(text)
    if bid is not None:
        out["bid"] = bid
    if acv is not None:
        out["acv"] = acv
    primary, secondary = extract_iaai_damages(text)
    if primary:
        out["damage"] = primary
    if secondary:
        out["secondary_damage"] = secondary
    # IAA masks the tail with asterisks, so a word-boundary cannot end the match.
    m = re.search(r"VIN:\s*([A-HJ-NPR-Z0-9*]{11,17})(?![A-HJ-NPR-Z0-9*])", text, re.I)
    if not m:
        m = re.search(r"(?<![A-HJ-NPR-Z0-9*])([A-HJ-NPR-Z0-9*]{11,17})(?![A-HJ-NPR-Z0-9*])", text)
    if m:
        out["vin"] = m.group(1)
    location = _parse_location(text)
    if location:
        out["location"] = location
    title = re.search(
        r"\b((?:19|20)\d{2})\s+([A-Za-z0-9][A-Za-z0-9-]{1,24})\s+(.+?)\s+Stock\s*#:",
        text,
        re.I,
    )
    if title:
        out["year"] = int(title.group(1))
        out["make"] = _title_case(title.group(2))
        out["model"] = _title_case(title.group(3))
    out["runs"] = bool(re.search(r"Run\s*&\s*Drive|Runs?\s*and\s*Drive", text, re.I))
    out["has_keys"] = bool(re.search(r"Key Available|Keys?\s*:\s*Present", text, re.I))
    return out


def repair_iaai_listing_blob(lot: Any) -> Any:
    """If a field is the whole search row, pull make, damage and location back out."""
    from app.models.lots import AuctionLot

    if not isinstance(lot, AuctionLot):
        return lot
    candidates = [lot.primaryDamage or "", lot.model or "", lot.make or ""]
    text = next((item for item in candidates if len(item) >= 80 and _LISTING_BLOB.search(item)), "")
    if not text:
        return lot
    fields = parse_iaai_text_fields(text)
    data = lot.model_dump()
    if fields.get("damage") and (len(lot.primaryDamage or "") >= 80 or not lot.primaryDamage):
        data["primaryDamage"] = fields["damage"]
    if fields.get("model") and len(lot.model or "") >= 80:
        data["model"] = fields["model"]
    if fields.get("make") and (lot.make in {"", "Unknown"} or len(lot.make or "") >= 80):
        data["make"] = fields["make"]
    if fields.get("year") and len(text) >= 80:
        data["year"] = fields["year"]
    if fields.get("secondary_damage") and not lot.secondaryDamage:
        data["secondaryDamage"] = fields["secondary_damage"]
    if fields.get("location") and lot.location in {"", "USA", "Unknown"}:
        data["location"] = fields["location"]
    if fields.get("odometer") and not lot.odometer:
        data["odometer"] = fields["odometer"]
    if fields.get("vin") and set(lot.vin or "") <= {"*"}:
        data["vin"] = fields["vin"]
    acv = fields.get("acv")
    bid = fields.get("bid")
    if (
        isinstance(bid, (int, float))
        and isinstance(acv, (int, float))
        and lot.currentBid
        and abs(lot.currentBid - float(acv)) < 0.01
        and abs(float(bid) - float(acv)) > 0.01
    ):
        data["currentBid"] = float(bid)
    return AuctionLot.model_validate(data)
