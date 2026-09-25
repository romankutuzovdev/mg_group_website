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
    const text = (row.innerText || '').replace(/\\s+/g, ' ').trim();
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


def parse_iaai_text_fields(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    m = re.search(r"([\d,]+)\s*mi\b", text, re.I)
    if m:
        out["odometer"] = int(m.group(1).replace(",", ""))
    m = re.search(r"\$([\d,]+)\s*USD", text, re.I)
    if m:
        out["bid"] = float(m.group(1).replace(",", ""))
    parts = [p.strip() for p in text.split("|")]
    for p in parts:
        if re.search(r"wear|collision|front|rear|side|hail|flood|burn|vandal", p, re.I):
            out["damage"] = p
            break
    m = re.search(r"\b([A-HJ-NPR-Z0-9*]{11,17})\b", text)
    if m:
        out["vin"] = m.group(1)
    for p in parts:
        if re.search(r"\([A-Za-z ]+\)", p) and "IAA" not in p and "USD" not in p:
            out["location"] = p.strip()
            break
    out["runs"] = bool(re.search(r"Run\s*&\s*Drive|Runs?\s*and\s*Drive", text, re.I))
    out["has_keys"] = bool(re.search(r"Key Available", text, re.I))
    return out
