"""Fetch lot details for the calculator.

1) Prefer production catalog (scraped lots on Windows API)
2) Fall back to Chrome CDP when lot is not in the store
"""

from __future__ import annotations

import logging
import re
from typing import Any

from playwright.async_api import async_playwright

from app.config import get_settings
from app.data.store import lot_store
from app.models.lots import AuctionLot
from app.scraper.browser import close_agent_tab, get_shared_context, launch_chromium

logger = logging.getLogger("mg.pricing.lot_lookup")

COPART_LOT_RE = re.compile(
    r"copart\.(?:com|co\.uk)/lot/(?:details/)?(\d+)",
    re.I,
)
BIDCars_LOT_RE = re.compile(
    r"bid\.cars/(?:[a-z]{2}/)?lot/(?:0-)?(\d+)",
    re.I,
)
IAAI_LOT_RE = re.compile(
    r"iaai\.com/(?:VehicleDetail|vehicledetail)/[^\s]*?[?#&]?(?:itemID|ItemID)=(\d+)",
    re.I,
)
IAAI_PATH_RE = re.compile(r"iaai\.com/.*/(\d{6,})", re.I)

COPART_JS = """
async (lotId) => {
  const out = { lotNumber: String(lotId), bid: null, year: null, make: null,
    model: null, title: null, location: null, odometer: null, images: [] };
  try {
    const r = await fetch('https://www.copart.com/public/data/lotdetails/solr/' + lotId, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) return { ...out, error: 'http_' + r.status };
    const j = await r.json();
    const d = (j && j.data && (j.data.lotDetails || j.data)) || j || {};
    out.bid = Number(d.highBid || d.hb || d.currentBid || d.buyTodayBid || 0) || null;
    out.year = Number(d.lcy || d.year || d.yr) || null;
    out.make = d.mkn || d.make || d.mn || null;
    out.model = d.lm || d.model || d.md || null;
    out.title = d.td || d.titleDesc || d.title || d.tsn || null;
    out.location = d.yn || d.yardName || d.loc || d.facilityName || null;
    out.odometer = Number(d.orr || d.odometer || d.oDoMeter) || null;
    const tims = d.tims || d.imageUrl || d.img;
    if (tims) out.images.push(String(tims));
  } catch (e) {
    out.error = String(e && e.message || e);
  }
  return out;
}
"""

BIDCars_JS = """
() => {
  const text = document.body ? document.body.innerText : '';
  const pick = (re) => {
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };
  const money = (re) => {
    const m = text.match(re);
    if (!m) return null;
    const n = Number(String(m[1]).replace(/[\\s,]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const title = (document.querySelector('h1') || {}).textContent || '';
  const yearM = title.match(/(19|20)\\d{2}/);
  let platform = null;
  if (/copart/i.test(text) && !/iaai/i.test(text.slice(0, 500))) platform = 'copart';
  if (/\\biaai\\b/i.test(text)) platform = 'iaai';
  const imgs = Array.from(document.querySelectorAll('img'))
    .map(i => i.src || i.getAttribute('data-src') || '')
    .filter(s => /images\\.bid\\.cars|cdn\\.bid\\.cars|\\.(jpe?g|webp)/i.test(s))
    .slice(0, 8);
  return {
    title: title.trim() || null,
    year: yearM ? Number(yearM[0]) : null,
    bid: money(/Current Bid[^0-9$]*\\$?([0-9][0-9,]*)/i)
      || money(/Ставка[^0-9$]*\\$?([0-9][0-9,]*)/i)
      || money(/\\$([0-9][0-9,]{2,})/),
    location: pick(/Location[:\\s]+([^\\n]+)/i) || pick(/Площадка[:\\s]+([^\\n]+)/i),
    titleDoc: pick(/Title[:\\s]+([^\\n]+)/i) || pick(/Документ[:\\s]+([^\\n]+)/i),
    odometer: money(/Odometer[^0-9]*([0-9][0-9,]*)/i),
    auction_platform: platform,
    images: imgs,
  };
}
"""


def normalize_lot_url(raw: str) -> str:
    u = (raw or "").strip()
    if not u:
        raise ValueError("Пустая ссылка")
    if not re.match(r"^https?://", u, re.I):
        u = "https://" + u.lstrip("/")
    return u


def detect_platform(url: str) -> str:
    low = url.lower()
    if "bid.cars" in low:
        return "bidcars"
    if "iaai.com" in low:
        return "iaai"
    if "copart.com" in low or "copart.co.uk" in low:
        return "copart"
    raise ValueError("Нужна ссылка Copart, IAAI или Bid.cars на лот")


def extract_lot_number(url: str, platform: str) -> str | None:
    if platform == "copart":
        m = COPART_LOT_RE.search(url)
        return m.group(1) if m else None
    if platform == "bidcars":
        m = BIDCars_LOT_RE.search(url)
        return m.group(1) if m else None
    if platform == "iaai":
        m = IAAI_LOT_RE.search(url) or IAAI_PATH_RE.search(url)
        return m.group(1) if m else None
    return None


def _platform_sources(platform: str) -> set[str]:
    if platform == "copart":
        return {"copart", "copart_uk"}
    if platform == "iaai":
        return {"iaai"}
    if platform == "bidcars":
        return {"copart", "iaai", "copart_uk"}
    return set()


def _title_label(lot: AuctionLot) -> str | None:
    label = (lot.titleLabel or "").strip()
    if label:
        return label
    if lot.titleType:
        return str(lot.titleType)
    return None


def lot_to_calculator_payload(
    lot: AuctionLot, *, url: str, via: str = "catalog"
) -> dict[str, Any]:
    """Map production catalog lot → calculator /lot-from-url response."""
    auction = "iaai" if lot.source == "iaai" else "copart"
    images = list(lot.imageUrls or [])
    if lot.imageUrl and lot.imageUrl not in images:
        images.insert(0, lot.imageUrl)
    return {
        "ok": True,
        "url": url or lot.lotUrl or "",
        "source": lot.source,
        "auction_platform": auction,
        "lotNumber": lot.lotNumber,
        "bid": lot.currentBid if lot.currentBid and lot.currentBid > 0 else None,
        "year": lot.year or None,
        "make": lot.make or None,
        "model": lot.model or None,
        "title": _title_label(lot),
        "location": lot.location or None,
        "odometer": lot.odometer if lot.odometer else None,
        "images": images[:12],
        "via": via,
        "lot_id": lot.id,
        "slug": lot.slug,
        "region": lot.region,
    }


def lookup_in_production_catalog(url: str) -> dict[str, Any] | None:
    """Prefer live Windows catalog (scraped lots) over opening Chrome."""
    canonical = normalize_lot_url(url)
    try:
        platform = detect_platform(canonical)
    except ValueError:
        return None
    lot_number = extract_lot_number(canonical, platform)
    if not lot_number:
        return None
    sources = _platform_sources(platform) or None
    lot = lot_store.find_by_lot_number(lot_number, sources=sources)
    if lot is None and sources:
        lot = lot_store.find_by_lot_number(lot_number, sources=None)
    if lot is None:
        return None
    logger.info(
        "lot-from-url from production catalog id=%s ln=%s bid=%s",
        lot.id,
        lot.lotNumber,
        lot.currentBid,
    )
    return lot_to_calculator_payload(lot, url=canonical, via="catalog")


async def fetch_lot_from_url(url: str) -> dict[str, Any]:
    """Resolve lot for calculator: production catalog first, Chrome CDP fallback."""
    from_store = lookup_in_production_catalog(url)
    if from_store and (from_store.get("bid") or from_store.get("make")):
        return from_store

    settings = get_settings()
    canonical = normalize_lot_url(url)
    platform = detect_platform(canonical)
    lot_number = extract_lot_number(canonical, platform)
    cdp = (settings.scraper_cdp_url or "").strip() or "http://127.0.0.1:9223"

    try:
        async with async_playwright() as pw:
            browser = await launch_chromium(
                pw,
                headless=settings.scraper_headless,
                cdp_url=cdp,
                cdp_autostart=settings.scraper_cdp_autostart,
                cdp_fallback_launch=False,
                cdp_headless=settings.scraper_cdp_headless,
            )
            page = None
            try:
                ctx = await get_shared_context(browser)
                page = await ctx.new_page()
                await page.goto(
                    canonical,
                    wait_until="domcontentloaded",
                    timeout=settings.scraper_timeout_ms,
                )
                await page.wait_for_timeout(1800)

                data: dict[str, Any] = {
                    "url": canonical,
                    "platform": platform,
                    "lotNumber": lot_number,
                }

                if platform == "copart" and lot_number:
                    api = await page.evaluate(COPART_JS, lot_number)
                    if isinstance(api, dict):
                        data.update({k: v for k, v in api.items() if v is not None})
                        if api.get("error") and not api.get("bid"):
                            raise RuntimeError(
                                f"Copart не отдал данные ({api.get('error')}). "
                                "Залогиньтесь в Chrome-профиле скрапера."
                            )
                elif platform == "bidcars":
                    dom = await page.evaluate(BIDCars_JS)
                    if isinstance(dom, dict):
                        data["bid"] = dom.get("bid")
                        data["year"] = dom.get("year")
                        data["location"] = dom.get("location")
                        data["title"] = dom.get("titleDoc") or dom.get("title")
                        data["odometer"] = dom.get("odometer")
                        data["images"] = dom.get("images") or []
                        if dom.get("title"):
                            parts = str(dom["title"]).split()
                            if len(parts) >= 3 and parts[0].isdigit():
                                data["year"] = data.get("year") or int(parts[0])
                                data["make"] = parts[1]
                                data["model"] = " ".join(parts[2:5])
                        if dom.get("auction_platform") in ("copart", "iaai"):
                            data["auction_platform"] = dom["auction_platform"]
                            data["platform"] = dom["auction_platform"]
                else:
                    title = await page.title()
                    text = await page.inner_text("body")
                    data["title"] = title
                    m_bid = re.search(
                        r"(?:Current Bid|High Bid|Ставка)[^\d$]*\$?\s*([0-9][0-9,]*)",
                        text,
                        re.I,
                    )
                    if m_bid:
                        data["bid"] = float(m_bid.group(1).replace(",", ""))
                    m_year = re.search(r"\b((?:19|20)\d{2})\b", title or text)
                    if m_year:
                        data["year"] = int(m_year.group(1))

                auction = data.get("auction_platform") or (
                    "copart" if data.get("platform") == "copart" else "iaai"
                )
                if auction not in ("copart", "iaai"):
                    auction = "copart" if "copart" in canonical.lower() else "iaai"

                chrome_payload = {
                    "ok": True,
                    "url": canonical,
                    "source": platform,
                    "auction_platform": auction,
                    "lotNumber": data.get("lotNumber") or lot_number,
                    "bid": data.get("bid"),
                    "year": data.get("year"),
                    "make": data.get("make"),
                    "model": data.get("model"),
                    "title": data.get("title"),
                    "location": data.get("location"),
                    "odometer": data.get("odometer"),
                    "images": data.get("images") or [],
                    "via": "chrome_cdp",
                    "cdp": cdp,
                }
                if not chrome_payload.get("bid") and not chrome_payload.get("make"):
                    if from_store:
                        return from_store
                    again = lookup_in_production_catalog(url)
                    if again:
                        return again
                return chrome_payload
            finally:
                if page is not None:
                    await close_agent_tab(page, force=True)
    except Exception as exc:
        logger.warning("chrome lot-from-url failed: %s", exc)
        if from_store:
            from_store = dict(from_store)
            from_store["via"] = "catalog_fallback"
            from_store["chrome_error"] = str(exc)
            return from_store
        again = lookup_in_production_catalog(url)
        if again:
            again = dict(again)
            again["via"] = "catalog_fallback"
            again["chrome_error"] = str(exc)
            return again
        raise
