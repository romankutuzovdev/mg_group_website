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
    model: null, title: null, location: null, odometer: null, images: [],
    bodyStyle: null, category: null };
  const pickCat = (text) => {
    if (!text) return null;
    const m = String(text).match(/\\b(?:cat(?:egory)?\\s*[-:]?\\s*|категор(?:ия)?\\s*[-:]?\\s*)([ABNSCDXU])\\b/i)
      || String(text).match(/\\b([AB])\\s*[-–]?\\s*(?:category|cat)\\b/i);
    return m ? m[1].toUpperCase() : null;
  };
  try {
    const origin = (location && location.origin) || 'https://www.copart.com';
    const r = await fetch(origin + '/public/data/lotdetails/solr/' + lotId, {
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
    out.title = d.td || d.titleDesc || d.title || d.tsn || d.tgd || d.ft || null;
    out.location = d.yn || d.yardName || d.yard_name || d.loc || d.facilityName
      || d.facility_name || d.saleLocation || d.salelocation || d.location || null;
    if (out.location && typeof out.location === 'object') {
      out.location = out.location.name || out.location.yardName || out.location.value || null;
    }
    out.odometer = Number(d.orr || d.odometer || d.oDoMeter) || null;
    out.bodyStyle = d.vehTypDesc || d.bodyStyle || d.bt || d.vehicleTypeDesc || null;
    out.category = pickCat(d.td) || pickCat(d.tgd) || pickCat(d.ft) || pickCat(d.tsn)
      || pickCat(d.lotCondDesc) || pickCat(d.lcd) || pickCat(d.scc)
      || pickCat(d.category) || pickCat(d.damageCategory) || null;
    const tims = d.tims || d.imageUrl || d.img;
    if (tims) out.images.push(String(tims));
  } catch (e) {
    out.error = String(e && e.message || e);
  }
  try {
    const text = (document.body && document.body.innerText) || '';
    if (!out.location) {
      const m = text.match(/(?:Sale\\s*location|Location|Yard|Площадка|Местоположение)\\s*:?\\s*([^\\n]{3,60})/i);
      if (m) out.location = m[1].trim();
    }
    if (!out.category) out.category = pickCat(text);
  } catch (e) {}
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
  const pickCat = (t) => {
    if (!t) return null;
    const m = String(t).match(/\\b(?:cat(?:egory)?\\s*[-:]?\\s*|категор(?:ия)?\\s*[-:]?\\s*)([ABNSCDXU])\\b/i)
      || String(t).match(/\\b([AB])\\s*[-–]?\\s*(?:category|cat)\\b/i);
    return m ? m[1].toUpperCase() : null;
  };
  const h1 = ((document.querySelector('h1') || {}).textContent || '').trim();
  const vinLike = /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(h1);
  let platform = null;
  if (/copart\\.co\\.uk|copart uk|united kingdom|great britain/i.test(text)) platform = 'copart_uk';
  else if (/\\biaai\\b/i.test(text)) platform = 'iaai';
  else if (/copart/i.test(text)) platform = 'copart';
  const bid = money(/Текущая ставка[^0-9$]*\\$?\\s*([0-9][0-9\\s,]*)/i)
    || money(/Current Bid[^0-9$]*\\$?\\s*([0-9][0-9,]*)/i)
    || money(/Ставка[^0-9$]*\\$?\\s*([0-9][0-9\\s,]*)/i);
  const odo = money(/Одометр[^0-9]*([0-9][0-9\\s,]*)/i)
    || money(/Odometer[^0-9]*([0-9][0-9,]*)/i);
  const bodyStyle = pick(/Тип кузова\\s*:?\\s*([^\\n]{3,40})/i)
    || pick(/Body\\s*(?:style|type)\\s*:?\\s*([^\\n]{3,40})/i)
    || pick(/Vehicle\\s*type\\s*:?\\s*([^\\n]{3,40})/i);
  return {
    title: vinLike ? null : (h1 || null),
    docTitle: document.title || '',
    year: null,
    bid,
    location: pick(/Местоположение\\s*:?\\s*([^\\n]{3,80})/i)
      || pick(/Location\\s*:?\\s*([^\\n]{3,80})/i)
      || pick(/Площадка\\s*:?\\s*([^\\n]{3,80})/i),
    titleDoc: pick(/Документы о продаже\\s*:?\\s*([^\\n]{3,80})/i)
      || pick(/Sale documents?\\s*:?\\s*([^\\n]{3,80})/i),
    bodyStyle,
    category: pickCat(text),
    odometer: odo,
    auction_platform: platform,
    images: Array.from(document.querySelectorAll('img'))
      .map(i => i.src || i.getAttribute('data-src') || '')
      .filter(s => /images\\.bid\\.cars|cdn\\.bid\\.cars|\\.(jpe?g|webp)/i.test(s))
      .slice(0, 12),
  };
}
"""


def clean_auction_location(raw: str | None) -> str | None:
    """Площадка с карточки Copart / IAAI / Bid.cars без соседних подписей."""
    if not raw:
        return None
    text = re.sub(r"\s+", " ", str(raw)).strip()
    text = re.split(
        r"\s+(?:Отправка из|Shipping from|Продавец|Seller|Одометр|Odometer|"
        r"Документ|Title|Пробег|VIN)\b",
        text,
        maxsplit=1,
    )[0].strip(" :-")
    text = re.sub(r"^(?:IAAI|Copart)\s*[-:]\s*", "", text, flags=re.I).strip()
    return text[:80] or None


def title_from_bidcars_url(url: str) -> tuple[int | None, str | None, str | None]:
    """Slug /2018-Audi-Q5-WA1... is the car. The h1 on the page is the VIN."""
    match = re.search(r"/lot/(?:\d+-)?\d+/([^/?#]+)", url or "", re.I)
    if not match:
        return None, None, None
    slug = re.sub(r"-?[A-HJ-NPR-Z0-9]{17}$", "", match.group(1), flags=re.I)
    slug = re.sub(r"[-_]+", " ", slug).strip()
    parts = slug.split()
    if len(parts) < 3 or not re.fullmatch(r"(?:19|20)\d{2}", parts[0]):
        return None, None, None
    model = " ".join(parts[2:5])
    return int(parts[0]), parts[1], model


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


def enrich_usa_inland(payload: dict[str, Any]) -> dict[str, Any]:
    """Как в desktop-боте: мили до NJ/Houston и $1/mi для машинокомплекта США."""
    out = dict(payload)
    region = str(out.get("region") or "").lower()
    source = str(out.get("source") or "").lower()
    is_uk = region == "uk" or source == "copart_uk" or "copart.co.uk" in str(out.get("url") or "").lower()
    if is_uk:
        return out
    location = out.get("location")
    existing = out.get("inlandMiles")
    if existing is not None and float(existing or 0) > 0 and out.get("milesToNewJersey") is not None:
        return out
    try:
        from app.services.usa_distance import resolve_us_inland

        route = resolve_us_inland(str(location or ""), None, allow_chrome_maps=False)
    except Exception as exc:
        logger.warning("resolve_us_inland failed: %s", exc)
        if out.get("inlandMiles") is None:
            out["inlandMiles"] = 450
        out["inlandOk"] = False
        return out
    if route.get("ok") and route.get("inland_miles") is not None:
        out["inlandMiles"] = float(route["inland_miles"])
        out["inlandUsd"] = float(route.get("inland_usd") or round(float(route["inland_miles"])))
        out["milesToNewJersey"] = route.get("miles_to_new_jersey")
        out["milesToHouston"] = route.get("miles_to_houston")
        out["usPort"] = route.get("us_port")
        out["usPortLabel"] = route.get("us_port_label")
        out["distanceSource"] = route.get("distance_source")
        out["inlandOk"] = True
    else:
        if out.get("inlandMiles") is None:
            out["inlandMiles"] = 450
        out["milesToNewJersey"] = route.get("miles_to_new_jersey")
        out["milesToHouston"] = route.get("miles_to_houston")
        out["inlandOk"] = False
        out["inlandError"] = route.get("error")
    return out


def lot_to_calculator_payload(
    lot: AuctionLot, *, url: str, via: str = "catalog"
) -> dict[str, Any]:
    """Map production catalog lot → calculator /lot-from-url response."""
    auction = "iaai" if lot.source == "iaai" else "copart"
    images = list(lot.imageUrls or [])
    if lot.imageUrl and lot.imageUrl not in images:
        images.insert(0, lot.imageUrl)
    payload = {
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
        "location": clean_auction_location(lot.location),
        "odometer": lot.odometer if lot.odometer else None,
        "images": images[:12],
        "category": lot.category,
        "bodyStyle": lot.bodyStyle,
        "inlandMiles": lot.inlandMiles,
        "currency": lot.currency,
        "via": via,
        "lot_id": lot.id,
        "slug": lot.slug,
        "region": lot.region,
    }
    if str(lot.region or "").lower() != "uk" and lot.source != "copart_uk":
        return enrich_usa_inland(payload)
    return payload


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
                if platform == "bidcars":
                    try:
                        await page.wait_for_function(
                            """() => /Местоположение|Location|Текущая ставка|Current Bid/i.test(
                              (document.body && document.body.innerText) || ''
                            )""",
                            timeout=12000,
                        )
                    except Exception:
                        await page.wait_for_timeout(2000)
                else:
                    await page.wait_for_timeout(1800)

                data: dict[str, Any] = {
                    "url": canonical,
                    "platform": platform,
                    "lotNumber": lot_number,
                }

                if platform == "iaai":
                    from app.scraper.iaai import parse_iaai_text_fields

                    body = await page.inner_text("body")
                    fields = parse_iaai_text_fields(body or "")
                    if fields.get("location"):
                        data["location"] = fields["location"]
                    if fields.get("bid") is not None:
                        data["bid"] = fields["bid"]
                    if fields.get("year"):
                        data["year"] = fields["year"]
                    if fields.get("make"):
                        data["make"] = fields["make"]
                    if fields.get("model"):
                        data["model"] = fields["model"]
                    if fields.get("odometer"):
                        data["odometer"] = fields["odometer"]

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
                        data["location"] = clean_auction_location(dom.get("location"))
                        data["title"] = dom.get("titleDoc") or dom.get("title")
                        data["odometer"] = dom.get("odometer")
                        data["images"] = dom.get("images") or []
                        year_u, make_u, model_u = title_from_bidcars_url(canonical)
                        doc_title = str(dom.get("docTitle") or "")
                        if year_u:
                            data["year"] = year_u
                            data["make"] = make_u
                            data["model"] = model_u
                        elif re.match(r"^(?:19|20)\d{2}\b", doc_title):
                            parts = doc_title.split()
                            if len(parts) >= 3 and parts[0].isdigit():
                                data["year"] = int(parts[0])
                                data["make"] = parts[1]
                                data["model"] = " ".join(parts[2:5]).strip("|,")
                        if dom.get("title") and not data.get("make"):
                            parts = str(dom["title"]).split()
                            if len(parts) >= 3 and parts[0].isdigit():
                                data["year"] = data.get("year") or int(parts[0])
                                data["make"] = parts[1]
                                data["model"] = " ".join(parts[2:5])
                        if dom.get("auction_platform") == "copart_uk":
                            data["auction_platform"] = "copart"
                            data["platform"] = "copart"
                            data["region"] = "uk"
                        elif dom.get("auction_platform") in ("copart", "iaai"):
                            data["auction_platform"] = dom["auction_platform"]
                            data["platform"] = dom["auction_platform"]
                        if dom.get("bodyStyle"):
                            data["bodyStyle"] = dom["bodyStyle"]
                        if dom.get("category"):
                            data["category"] = dom["category"]
                elif platform != "iaai":
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
                is_uk = "copart.co.uk" in canonical.lower() or data.get("region") == "uk"
                title_text = str(data.get("title") or "")
                category = str(data.get("category") or "").strip().upper() or None
                if category and len(category) > 1:
                    cat_m = re.search(r"\b([ABNSCDXU])\b", category, re.I)
                    category = cat_m.group(1).upper() if cat_m else None
                if not category:
                    cat_m = re.search(
                        r"\bCat(?:egory)?\s*[-:]?\s*([ABNSCDXU])\b",
                        title_text,
                        re.I,
                    )
                    category = cat_m.group(1).upper() if cat_m else None
                source = "copart_uk" if is_uk else platform

                chrome_payload = {
                    "ok": True,
                    "url": canonical,
                    "source": source,
                    "region": "uk" if is_uk else "usa",
                    "auction_platform": auction,
                    "category": category,
                    "lotNumber": data.get("lotNumber") or lot_number,
                    "bid": data.get("bid"),
                    "year": data.get("year"),
                    "make": data.get("make"),
                    "model": data.get("model"),
                    "title": data.get("title"),
                    "location": clean_auction_location(data.get("location")),
                    "odometer": data.get("odometer"),
                    "bodyStyle": data.get("bodyStyle"),
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
                if not is_uk:
                    chrome_payload = enrich_usa_inland(chrome_payload)
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
