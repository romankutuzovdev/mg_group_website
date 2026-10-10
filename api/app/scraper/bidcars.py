"""Bid.cars search cards: first photo and the price printed on the card.

Does not open lot pages and does not download the "similar lots" block.
Active cards fill the USA catalog. Archived cards are stored as sold
and shown on the site as similar sales of the same model.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from playwright.async_api import Page

from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.bidcars")

ACTIVE_URL = (
    "https://bid.cars/en/search?search-type=filters&status=Active&type=Automobile"
)
SOLD_URLS = (
    "https://bid.cars/en/search/archived?search-type=filters&type=Automobile",
    "https://bid.cars/en/search?search-type=filters&status=Sold&type=Automobile",
)

_EXTRACT_JS = r"""
() => {
  const money = (raw) => String(raw || '').replace(/,/g, '');
  const prices = (text) =>
    [...String(text || '').matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) => m[1]);
  const seen = new Set();
  const out = [];
  const links = Array.from(document.querySelectorAll('a[href*="/lot/"]'));
  for (const a of links) {
    const href = a.href || '';
    const idMatch = href.match(/\/lot\/(?:\d+-)?(\d+)(?:\/|$)/i);
    if (!idMatch || seen.has(idMatch[1])) continue;
    const card = a.closest('article, li, .item, .lot, .card') || a.parentElement || a;
    const img = card.querySelector('img') || a.querySelector('img');
    const src = img
      ? (img.currentSrc || img.src || img.getAttribute('data-src') || '')
      : '';
    if (!src || src.startsWith('data:') || src.length < 12) continue;
    seen.add(idMatch[1]);
    const text = ((card.innerText || a.innerText || '') + '').replace(/\s+/g, ' ').slice(0, 800);
    const title = (
      (img && img.alt) ||
      a.getAttribute('title') ||
      ''
    ).trim();
    const est = text.match(
      /estimated\s*cost\s*:?\s*\$\s*([\d,]+(?:\.\d+)?)\s*[-–—]\s*\$\s*([\d,]+(?:\.\d+)?)/i
    );
    const all = prices(text);
    let bid = '';
    if (est) {
      const low = money(est[1]);
      const high = money(est[2]);
      bid = all.map(money).find((n) => n !== low && n !== high) || '';
    } else if (all.length) {
      bid = money(all[0]);
    }
    out.push({
      lotNumber: idMatch[1],
      url: href.split('?')[0],
      image: src,
      title,
      price: bid,
      estimatedMin: est ? money(est[1]) : '',
      estimatedMax: est ? money(est[2]) : '',
      text,
    });
  }
  return out;
}
"""


def _with_page(url: str, page: int) -> str:
    parts = urlparse(url)
    qs = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "page"]
    qs.append(("page", str(page)))
    return urlunparse(parts._replace(query=urlencode(qs)))


async def _blocked_reason(tab: Page) -> str:
    return await tab.evaluate(
        """() => {
          const t = (document.body && document.body.innerText) || '';
          const hasLots = !!document.querySelector('a[href*="/lot/"]');
          if (hasLots || t.length > 800) return '';
          if (/just a moment|cf-challenge|attention required|cloudflare/i.test(t))
            return 'cloudflare';
          if (/access denied/i.test(t)) return 'access_denied';
          return 'loading';
        }"""
    )


async def _wait_ready(tab: Page) -> str:
    blocked = "loading"
    for _ in range(15):
        blocked = await _blocked_reason(tab)
        if blocked != "loading":
            return blocked
        await tab.wait_for_timeout(1000)
    return "empty_page"


async def _collect_feed(
    tab: Page,
    start_url: str,
    *,
    max_pages: int,
    sold: bool,
    seen: set[str],
) -> list[dict[str, Any]]:
    lots: list[dict[str, Any]] = []
    empty_streak = 0
    for page_idx in range(1, max_pages + 1):
        url = _with_page(start_url, page_idx)
        logger.info("bidcars %s page %s → %s", "sold" if sold else "active", page_idx, url)
        await tab.goto(url, wait_until="domcontentloaded", timeout=60000)
        blocked = await _wait_ready(tab)
        if blocked:
            if page_idx == 1:
                logger.error("bidcars blocked by %s on %s", blocked, url)
                return [{"_blocked": True, "reason": blocked}]
            break
        rows = await tab.evaluate(_EXTRACT_JS)
        added = 0
        for row in rows or []:
            ln = str(row.get("lotNumber") or "")
            if not ln or ln in seen:
                continue
            seen.add(ln)
            row["sold"] = sold
            lots.append(row)
            added += 1
        logger.info("bidcars %s page %s: +%s", "sold" if sold else "active", page_idx, added)
        if added == 0:
            empty_streak += 1
            if empty_streak >= 2:
                break
        else:
            empty_streak = 0
    return lots


async def scrape_bidcars(
    *,
    max_pages: int = 80,
    sold_pages: int = 40,
    headless: bool = True,
    timeout_ms: int = 60000,
    page: Page | None = None,
    browser: Any = None,
) -> list[dict[str, Any]]:
    del timeout_ms
    session = TabSession()
    tab = await session.start(page=page, browser=browser, headless=headless)
    seen: set[str] = set()
    try:
        active = await _collect_feed(
            tab, ACTIVE_URL, max_pages=max_pages, sold=False, seen=seen
        )
        if active and active[0].get("_blocked"):
            return active
        sold: list[dict[str, Any]] = []
        for sold_url in SOLD_URLS:
            chunk = await _collect_feed(
                tab, sold_url, max_pages=sold_pages, sold=True, seen=set()
            )
            if chunk and chunk[0].get("_blocked"):
                continue
            if chunk:
                sold = chunk
                break
        # A lot that is still active wins over the archived copy.
        active_ids = {str(r.get("lotNumber") or "") for r in active}
        sold = [r for r in sold if str(r.get("lotNumber") or "") not in active_ids]
        logger.info("bidcars done: active=%s sold=%s", len(active), len(sold))
        return active + sold
    except Exception as exc:
        logger.exception("bidcars scrape failed: %s", exc)
        return [{"_blocked": True, "reason": re.sub(r"\s+", " ", str(exc))[:180]}]
