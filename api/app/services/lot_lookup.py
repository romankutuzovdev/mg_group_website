"""Fetch lot details for the calculator.

1) Prefer production catalog (scraped lots on Windows API)
2) Fall back to Chrome CDP when lot is not in the store
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from playwright.async_api import Page

from app.data.store import lot_store
from app.models.lots import AuctionLot
from app.services.calc_chrome import get_calc_chrome_pool

logger = logging.getLogger("mg.pricing.lot_lookup")

_CHROME_GOTO_MS = 12_000

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
    const s = String(text);
    // Ignore nav/marketing: "Buying Cat Bs", long page blobs
    if (s.length > 120 || /buying\\s+cat/i.test(s)) return null;
    const m = s.match(/\\b(?:cat(?:egory)?|категор(?:ия)?)\\s*[-:.]?\\s*([ABNSCDXU])(?![A-Za-z])/i)
      || s.match(/\\b([ABNSCDXU])\\s*[-–]?\\s*(?:category|cat)\\b/i);
    return m ? m[1].toUpperCase() : null;
  };
  const textOf = (el) => (el && (el.textContent || el.innerText) || '').replace(/\\s+/g, ' ').trim();
  try {
    const origin = (location && location.origin) || 'https://www.copart.com';
    const r = await fetch(origin + '/public/data/lotdetails/solr/' + lotId, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) return { ...out, error: 'http_' + r.status };
    const j = await r.json();
    const d = (j && j.data && (j.data.lotDetails || j.data)) || j || {};
    const dyn = (j && j.data && j.data.dynamicLotDetails) || {};
    out.bid = Number(
      (dyn && (dyn.currentBid || dyn.highBid || dyn.buyTodayBid || dyn.salePrice))
      || d.highBid || d.hb || d.currentBid || d.buyTodayBid
      || d.highBidAmount || d.bidAmount || d.salePrice || 0
    ) || null;
    out.year = Number(d.lcy || d.year || d.yr) || null;
    out.make = d.mkn || d.make || d.mn || null;
    out.model = d.lm || d.model || d.md || null;
    out.title = d.td || d.titleDesc || d.title || d.tsn || d.tgd || d.ft || null;
    out.location = d.yn || d.yardName || d.yard_name || d.aname || d.loc
      || d.facilityName || d.facility_name || d.saleLocation || d.salelocation
      || d.physicalYardName || d.yard || d.location || null;
    if (out.location && typeof out.location === 'object') {
      out.location = out.location.name || out.location.yardName || out.location.value
        || out.location.yn || null;
    }
    out.odometer = Number(d.orr || d.odometer || d.oDoMeter) || null;
    out.bodyStyle = d.vehTypDesc || d.bodyStyle || d.bt || d.vehicleTypeDesc || null;
    // Only short lot-detail fields — never full page text (menu "Buying Cat Bs")
    out.category = pickCat(d.td) || pickCat(d.tgd) || pickCat(d.ft) || pickCat(d.tsn)
      || pickCat(d.lotCondDesc) || pickCat(d.lcd) || pickCat(d.scc)
      || pickCat(d.category) || pickCat(d.damageCategory) || null;
    const tims = d.tims || d.imageUrl || d.img;
    if (tims) out.images.push(String(tims));
  } catch (e) {
    out.error = String(e && e.message || e);
  }
  try {
    const btn = document.querySelector('#locationInfoButton, [id*="locationInfo"], a[href*="yard"], [data-uname="lotdetailSaleLocation"]');
    const fromBtn = textOf(btn);
    if (fromBtn && fromBtn.length >= 3 && fromBtn.length < 80) out.location = fromBtn;
    // Clean / Clear title in URL or title ⇒ not Cat A/B
    const path = String((location && location.pathname) || '');
    const titleBlob = String(out.title || '');
    if (/clean[-_\\s]?title|clear[-_\\s]?title/i.test(path + ' ' + titleBlob)) {
      if (out.category === 'A' || out.category === 'B') out.category = null;
    }
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
    const s = String(t);
    if (s.length > 120 || /buying\\s+cat/i.test(s)) return null;
    const m = s.match(/\\b(?:cat(?:egory)?|категор(?:ия)?)\\s*[-:.]?\\s*([ABNSCDXU])(?![A-Za-z])/i)
      || s.match(/\\b([ABNSCDXU])\\s*[-–]?\\s*(?:category|cat)\\b/i);
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
    category: pickCat(pick(/Категор(?:ия)?\\s*:?\\s*([^\\n]{1,20})/i)
      || pick(/Cat(?:egory)?\\s*:?\\s*([^\\n]{1,20})/i)
      || ''),
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
        r"Документ|Title|Пробег|VIN|Current Bid|Текущая ставка)\b",
        text,
        maxsplit=1,
    )[0].strip(" :-")
    text = re.sub(r"^(?:IAAI|Copart(?:\s+UK)?)\s*[-:]\s*", "", text, flags=re.I).strip()
    if re.fullmatch(r"(?:UK|USA|United Kingdom|Great Britain)", text or "", re.I):
        return None
    return text[:80] or None


def sanitize_uk_category(
    category: str | None,
    *,
    url: str = "",
    title: str = "",
) -> str | None:
    """Keep only real Copart UK Cat letters; drop Clean-title false Cat A/B."""
    raw = (category or "").strip().upper()
    if not raw:
        return None
    if len(raw) > 1:
        m = re.search(r"\b(?:CAT(?:EGORY)?|КАТЕГОР(?:ИЯ)?)\s*[-:.]?\s*([ABNSCDXU])\b", raw, re.I)
        if not m:
            m = re.search(r"\b([ABNSCDXU])\b", raw)
        raw = m.group(1).upper() if m else ""
    if raw not in {"A", "B", "N", "S", "C", "D", "X", "U"}:
        return None
    blob = f"{url} {title}"
    if re.search(r"clean[-_\s]?title|clear[-_\s]?title", blob, re.I) and raw in {"A", "B"}:
        return None
    return raw


def yard_from_copart_uk_url(url: str) -> str | None:
    """Copart UK slug ends with yard: ...-step-auto-corby → CORBY."""
    if "copart.co.uk" not in (url or "").lower():
        return None
    m = re.search(r"/lot/\d+/([^/?#]+)", url or "", re.I)
    if not m:
        return None
    from app.services.pricing import DELIVERY_RATES, resolve_region

    yards = sorted(
        (k for k in DELIVERY_RATES if k != "DEFAULT"),
        key=len,
        reverse=True,
    )
    parts = [p for p in m.group(1).lower().split("-") if p]
    for n in (3, 2, 1):
        if len(parts) < n:
            continue
        candidate = " ".join(parts[-n:]).upper()
        if candidate in DELIVERY_RATES and candidate != "DEFAULT":
            return candidate
    slug = " ".join(parts).upper()
    for yard in yards:
        pattern = re.sub(r"\s+", r"[\\s-]+", re.escape(yard))
        if re.search(rf"(?:^|[\s-]){pattern}(?:$|[\s-])", slug.replace(" ", "-"), re.I):
            return yard
        if re.search(rf"\b{re.escape(yard)}\b", slug):
            return yard
    if parts:
        resolved = resolve_region(parts[-1])
        if resolved != "DEFAULT":
            return resolved
    return None


def title_from_copart_uk_url(url: str) -> tuple[int | None, str | None, str | None]:
    """Slug .../lot/123/clean-title-2018-mercedes-benz-gla-...-rochford → year/make/model."""
    if "copart.co.uk" not in (url or "").lower():
        return None, None, None
    m = re.search(r"/lot/\d+/([^/?#]+)", url or "", re.I)
    if not m:
        return None, None, None
    from app.services.pricing import DELIVERY_RATES

    parts = [p for p in m.group(1).lower().split("-") if p]
    yard_tokens: set[str] = set()
    for key in DELIVERY_RATES:
        if key == "DEFAULT":
            continue
        toks = key.lower().split()
        yard_tokens.add(toks[-1])
        if len(toks) >= 2:
            yard_tokens.add("-".join(toks))
    # Strip trailing yard (rochford / east-kilbride)
    if len(parts) >= 2 and f"{parts[-2]}-{parts[-1]}" in yard_tokens:
        parts = parts[:-2]
    elif parts and parts[-1] in yard_tokens:
        parts = parts[:-1]
    # Drop leading junk before year
    while parts and not re.fullmatch(r"(?:19|20)\d{2}", parts[0]):
        parts = parts[1:]
    if len(parts) < 2:
        return None, None, None
    year = int(parts[0])
    rest = parts[1:]
    if len(rest) >= 2 and rest[1] in {"benz", "romeo", "martin", "rover"}:
        make = f"{rest[0].title()}-{rest[1].title()}"
        model_parts = rest[2:5]
    else:
        make = rest[0].title()
        model_parts = rest[1:4]
    if make.upper() == "BMW":
        make = "BMW"
    model = " ".join(model_parts).upper() if model_parts else None
    return year, make, model


def apply_uk_url_yard(payload: dict[str, Any], url: str) -> dict[str, Any]:
    """URL slug is source of truth for UK yard (+ fill year/make when missing)."""
    out = dict(payload)
    canonical = url or str(out.get("url") or "")
    out["category"] = sanitize_uk_category(
        out.get("category"),
        url=canonical,
        title=str(out.get("title") or ""),
    )
    slug_yard = yard_from_copart_uk_url(canonical)
    if slug_yard:
        # Always prefer yard from the link over stale catalog / wrong Solr
        out["location"] = slug_yard
        via = str(out.get("via") or "")
        if "url_yard" not in via:
            out["via"] = f"{via}+url_yard" if via else "url_yard"
    year_u, make_u, model_u = title_from_copart_uk_url(canonical)
    if year_u and not out.get("year"):
        out["year"] = year_u
    if make_u and not out.get("make"):
        out["make"] = make_u
    if model_u and not out.get("model"):
        out["model"] = model_u
    if not out.get("lotNumber"):
        out["lotNumber"] = extract_lot_number(canonical, "copart")
    # Enough to open the calculator even when Chrome/catalog failed
    if out.get("location") or out.get("make") or out.get("lotNumber"):
        out["ok"] = True
        out.setdefault("region", "uk")
        out.setdefault("source", "copart_uk")
        out.setdefault("auction_platform", "copart")
    return out


def _is_uk_payload(payload: dict[str, Any]) -> bool:
    region = str(payload.get("region") or "").lower()
    source = str(payload.get("source") or "").lower()
    url = str(payload.get("url") or "").lower()
    return region == "uk" or source == "copart_uk" or "copart.co.uk" in url


def uk_location_needs_refresh(payload: dict[str, Any] | None) -> bool:
    """Catalog often stores location='UK' — need Chrome for real yard name."""
    if not payload or not _is_uk_payload(payload):
        return False
    from app.services.pricing import resolve_region

    return resolve_region(payload.get("location")) == "DEFAULT"


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


def soft_lot_payload(url: str, error: str) -> dict[str, Any]:
    """Always-200 fallback so the calculator UI never dies on Chrome/CDP 502."""
    try:
        canonical = normalize_lot_url(url)
        platform = detect_platform(canonical)
        lot_number = extract_lot_number(canonical, platform)
    except Exception:
        canonical = (url or "").strip()
        platform = "copart"
        lot_number = None
    is_uk = "copart.co.uk" in canonical.lower() or (platform == "copart" and "uk" in canonical.lower())
    year_u, make_u, model_u = (None, None, None)
    location = None
    try:
        if "bid.cars" in canonical.lower():
            year_u, make_u, model_u = title_from_bidcars_url(canonical)
        elif is_uk:
            year_u, make_u, model_u = title_from_copart_uk_url(canonical)
            location = yard_from_copart_uk_url(canonical)
    except Exception:
        pass
    payload: dict[str, Any] = {
        "ok": False,
        "url": canonical,
        "source": (
            "copart_uk" if is_uk
            else "iaai" if platform == "iaai"
            else "copart"
        ),
        "region": "uk" if is_uk else "usa",
        "auction_platform": "iaai" if platform == "iaai" else "copart",
        "lotNumber": lot_number,
        "bid": None,
        "year": year_u,
        "make": make_u,
        "model": model_u,
        "title": None,
        "location": location,
        "odometer": None,
        "bodyStyle": None,
        "category": None,
        "images": [],
        "via": "soft_fallback",
        "error": (error or "lot_lookup_failed")[:300],
    }
    if is_uk:
        return apply_uk_url_yard(payload, canonical)
    return payload


def enrich_usa_inland(payload: dict[str, Any], *, live: bool = False) -> dict[str, Any]:
    """Как в desktop-боте: мили до NJ/Houston и $1/mi для машинокомплекта США.

    live=False: only apply fallback / keep existing miles (never block on HTTP).
    Prefer enrich_usa_inland_async on the request path.
    """
    out = dict(payload)
    region = str(out.get("region") or "").lower()
    source = str(out.get("source") or "").lower()
    is_uk = region == "uk" or source == "copart_uk" or "copart.co.uk" in str(out.get("url") or "").lower()
    if is_uk:
        return out
    existing = out.get("inlandMiles")
    if (
        existing is not None
        and float(existing or 0) > 0
        and out.get("milesToNewJersey") is not None
        and out.get("milesToHouston") is not None
    ):
        out.setdefault("inlandOk", True)
        return out
    if not live:
        if out.get("inlandMiles") is None:
            out["inlandMiles"] = 450
        out.setdefault("inlandOk", False)
        out.setdefault("inlandError", "live_miles_skipped")
        return out
    try:
        from app.services.usa_distance import resolve_us_inland

        route = resolve_us_inland(str(out.get("location") or ""), None, allow_chrome_maps=False)
    except Exception as exc:
        logger.warning("resolve_us_inland failed: %s", exc)
        if out.get("inlandMiles") is None:
            out["inlandMiles"] = 450
        out["inlandOk"] = False
        return out
    return _apply_inland_route(out, route)


def _apply_inland_route(payload: dict[str, Any], route: dict[str, Any]) -> dict[str, Any]:
    out = dict(payload)
    if route.get("ok") and route.get("inland_miles") is not None:
        out["inlandMiles"] = float(route["inland_miles"])
        out["inlandUsd"] = float(route.get("inland_usd") or round(float(route["inland_miles"])))
        out["milesToNewJersey"] = route.get("miles_to_new_jersey")
        out["milesToHouston"] = route.get("miles_to_houston")
        out["usPort"] = route.get("us_port")
        out["usPortLabel"] = route.get("us_port_label")
        out["distanceSource"] = route.get("distance_source")
        out["inlandOk"] = True
        out.pop("inlandError", None)
    else:
        if out.get("inlandMiles") is None:
            out["inlandMiles"] = 450
        out["milesToNewJersey"] = route.get("miles_to_new_jersey")
        out["milesToHouston"] = route.get("miles_to_houston")
        out["inlandOk"] = False
        out["inlandError"] = route.get("error") or "miles_unavailable"
    return out


async def enrich_usa_inland_async(
    payload: dict[str, Any],
    *,
    timeout: float = 4.0,
) -> dict[str, Any]:
    """Resolve NJ/Houston miles off the event loop (thread) with a hard timeout."""
    out = dict(payload)
    if _is_uk_payload(out):
        return out
    if (
        out.get("inlandOk")
        and out.get("milesToNewJersey") is not None
        and out.get("milesToHouston") is not None
        and float(out.get("inlandMiles") or 0) > 0
    ):
        return out
    location = clean_auction_location(str(out.get("location") or "")) or str(out.get("location") or "").strip()
    if not location:
        return enrich_usa_inland(out, live=False)
    try:
        from app.services.usa_distance import resolve_us_inland

        route = await asyncio.wait_for(
            asyncio.to_thread(
                lambda: resolve_us_inland(location, None, allow_chrome_maps=False)
            ),
            timeout=max(1.0, timeout),
        )
        if isinstance(route, dict):
            return _apply_inland_route(out, route)
    except asyncio.TimeoutError:
        logger.warning("usa inland timeout (%.1fs) for %s", timeout, location[:60])
        out["inlandError"] = "miles_timeout"
    except Exception as exc:
        logger.warning("usa inland async failed: %s", exc)
        out["inlandError"] = str(exc)[:200]
    return enrich_usa_inland(out, live=False)


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
    if str(lot.region or "").lower() == "uk" or lot.source == "copart_uk":
        payload["category"] = sanitize_uk_category(
            lot.category,
            url=url or lot.lotUrl or "",
            title=str(_title_label(lot) or ""),
        )
    # Miles resolved async in fetch_lot_from_url (Bid.cars / Copart / IAAI USA).
    if lot.inlandMiles is not None and float(lot.inlandMiles or 0) > 0:
        payload["inlandOk"] = True
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
    is_uk = "copart.co.uk" in canonical.lower()
    if is_uk:
        sources: set[str] | None = {"copart_uk"}
    else:
        sources = _platform_sources(platform) or None
        if sources and "copart" in sources:
            # USA Copart URL — do not pick UK twin by the same lot #
            sources = {s for s in sources if s != "copart_uk"} or sources
    lot = lot_store.find_by_lot_number(lot_number, sources=sources)
    if lot is None and sources:
        lot = lot_store.find_by_lot_number(lot_number, sources=None)
    if lot is None:
        return None
    logger.info(
        "lot-from-url from production catalog id=%s ln=%s bid=%s loc=%s",
        lot.id,
        lot.lotNumber,
        lot.currentBid,
        lot.location,
    )
    payload = lot_to_calculator_payload(lot, url=canonical, via="catalog")
    if is_uk:
        payload = apply_uk_url_yard(payload, canonical)
    return payload


async def _scrape_lot_on_page(page: Page, url: str) -> dict[str, Any]:
    """Scrape calculator fields on an already-open page (pool owns open/close)."""
    canonical = normalize_lot_url(url)
    platform = detect_platform(canonical)
    lot_number = extract_lot_number(canonical, platform)

    await page.goto(
        canonical,
        wait_until="domcontentloaded",
        timeout=_CHROME_GOTO_MS,
    )
    if platform == "bidcars":
        try:
            await page.wait_for_function(
                """() => /Местоположение|Location|Текущая ставка|Current Bid/i.test(
                  (document.body && document.body.innerText) || ''
                )""",
                timeout=8000,
            )
        except Exception:
            await page.wait_for_timeout(1500)
    elif platform == "copart":
        try:
            await page.wait_for_function(
                """() => Boolean(
                  document.querySelector('#locationInfoButton') ||
                  /Sale\\s*location|Location\\s*:/i.test(
                    (document.body && document.body.innerText) || ''
                  )
                )""",
                timeout=8000,
            )
        except Exception:
            await page.wait_for_timeout(1500)
    else:
        await page.wait_for_timeout(1200)

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
            if api.get("error") and not api.get("bid") and not api.get("location"):
                data["chrome_error"] = f"Copart API: {api.get('error')}"
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
        "copart" if data.get("platform") in ("copart", "bidcars") else "iaai"
    )
    if auction not in ("copart", "iaai"):
        if "bid.cars" in canonical.lower() or "copart" in canonical.lower():
            auction = "copart"
        else:
            auction = "iaai"
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
    # Normalize source for calculator (never leave raw "bidcars")
    if is_uk:
        source = "copart_uk"
    elif auction == "iaai":
        source = "iaai"
    else:
        source = "copart"

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
    }
    if data.get("chrome_error"):
        chrome_payload["chrome_error"] = data["chrome_error"]
    if is_uk:
        chrome_payload["category"] = sanitize_uk_category(
            category, url=canonical, title=title_text
        )
    return chrome_payload


async def _fetch_lot_via_chrome(url: str, *, optional: bool = False) -> dict[str, Any] | None:
    """Run lot scrape under the shared calc Chrome pool (tabs always closed)."""
    pool = get_calc_chrome_pool()

    async def worker(page: Page) -> dict[str, Any]:
        return await _scrape_lot_on_page(page, url)

    return await pool.run(worker, optional=optional)


def _merge_fields(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key in (
        "location",
        "category",
        "bodyStyle",
        "bid",
        "year",
        "make",
        "model",
        "title",
        "odometer",
    ):
        val = extra.get(key)
        if val is None or val == "":
            continue
        if key == "location":
            cleaned = clean_auction_location(str(val))
            if cleaned:
                merged["location"] = cleaned
            continue
        # Live Solr bid always wins over stale catalog
        if key == "bid":
            try:
                live = float(val)
            except (TypeError, ValueError):
                continue
            if live > 0:
                merged["bid"] = live
            continue
        merged[key] = val
    return merged


async def _enrich_uk_via_agent_tab(
    url: str, catalog: dict[str, Any]
) -> dict[str, Any] | None:
    """Refresh bid / yard / body / category from the permanent copart_uk tab."""
    lot_number = str(catalog.get("lotNumber") or extract_lot_number(url, "copart") or "").strip()
    if not lot_number:
        return None

    try:
        from app.scraper.worker import scraper_worker
    except Exception:
        return None

    raw = await scraper_worker.evaluate_on_agent_tab(
        "copart_uk",
        COPART_JS,
        lot_number,
        timeout_sec=6.0,
    )
    if not isinstance(raw, dict):
        raw = await scraper_worker.evaluate_on_agent_tab(
            "copart",
            COPART_JS,
            lot_number,
            timeout_sec=5.0,
        )
    if not isinstance(raw, dict):
        return None

    extra: dict[str, Any] = {
        "location": raw.get("location"),
        "bodyStyle": raw.get("bodyStyle"),
        "category": raw.get("category"),
        "bid": raw.get("bid"),
        "year": raw.get("year"),
        "make": raw.get("make"),
        "model": raw.get("model"),
        "title": raw.get("title"),
        "odometer": raw.get("odometer"),
    }
    if isinstance(extra.get("category"), str) and len(extra["category"]) > 1:
        cat_m = re.search(r"\b([ABNSCDXU])\b", extra["category"], re.I)
        extra["category"] = cat_m.group(1).upper() if cat_m else None

    merged = _merge_fields(catalog, extra)
    merged["via"] = "catalog+agent_tab"
    return apply_uk_url_yard(merged, url)


def _merge_chrome_into_catalog(
    catalog: dict[str, Any], chrome: dict[str, Any]
) -> dict[str, Any]:
    merged = _merge_fields(catalog, chrome)
    merged["via"] = "catalog+chrome"
    return merged


def _payload_from_copart_js(
    raw: dict[str, Any],
    *,
    url: str,
    lot_number: str | None,
    is_uk: bool,
    via: str,
) -> dict[str, Any]:
    category = str(raw.get("category") or "").strip().upper() or None
    if category and len(category) > 1:
        cat_m = re.search(r"\b([ABNSCDXU])\b", category, re.I)
        category = cat_m.group(1).upper() if cat_m else None
    if not category:
        cat_m = re.search(
            r"\bCat(?:egory)?\s*[-:]?\s*([ABNSCDXU])\b",
            str(raw.get("title") or ""),
            re.I,
        )
        category = cat_m.group(1).upper() if cat_m else None

    payload = {
        "ok": True,
        "url": url,
        "source": "copart_uk" if is_uk else "copart",
        "region": "uk" if is_uk else "usa",
        "auction_platform": "copart",
        "category": category,
        "lotNumber": raw.get("lotNumber") or lot_number,
        "bid": raw.get("bid"),
        "year": raw.get("year"),
        "make": raw.get("make"),
        "model": raw.get("model"),
        "title": raw.get("title"),
        "location": clean_auction_location(raw.get("location")),
        "odometer": raw.get("odometer"),
        "bodyStyle": raw.get("bodyStyle"),
        "images": raw.get("images") or [],
        "via": via,
    }
    if is_uk:
        payload["category"] = sanitize_uk_category(
            category, url=url, title=str(raw.get("title") or "")
        )
    return payload


async def _fetch_copart_via_agent_tab(url: str) -> dict[str, Any] | None:
    """Read lot via permanent scraper tab Solr fetch — no new Chrome tabs."""
    canonical = normalize_lot_url(url)
    is_uk = "copart.co.uk" in canonical.lower()
    lot_number = extract_lot_number(canonical, "copart")
    if not lot_number:
        return None
    try:
        from app.scraper.worker import scraper_worker
    except Exception:
        return None

    source = "copart_uk" if is_uk else "copart"
    raw = await scraper_worker.evaluate_on_agent_tab(
        source,
        COPART_JS,
        lot_number,
        timeout_sec=6.0,
    )
    if not isinstance(raw, dict):
        alt = "copart" if is_uk else "copart_uk"
        raw = await scraper_worker.evaluate_on_agent_tab(
            alt,
            COPART_JS,
            lot_number,
            timeout_sec=5.0,
        )
    if not isinstance(raw, dict):
        return None
    if raw.get("error") and not raw.get("bid") and not raw.get("make") and not raw.get("location"):
        return None
    return _payload_from_copart_js(
        raw,
        url=canonical,
        lot_number=lot_number,
        is_uk=is_uk,
        via="agent_tab",
    )


async def _finalize_lot_payload(payload: dict[str, Any], remaining: float) -> dict[str, Any]:
    """Attach live USA inland miles (NJ/Houston) when budget allows."""
    if _is_uk_payload(payload):
        return payload
    return await enrich_usa_inland_async(
        payload,
        timeout=min(4.0, max(1.2, remaining)),
    )


async def fetch_lot_from_url(url: str) -> dict[str, Any]:
    """Open lot for calculator.

    Catalog is only a cache. Always overlay UK yard from the URL slug and
    always try a live Solr/Chrome refresh — even when the lot is already in DB.
    """
    import time

    deadline = time.monotonic() + 14.0

    def _remaining() -> float:
        return max(0.5, deadline - time.monotonic())

    try:
        canonical = normalize_lot_url(url)
    except ValueError as exc:
        return soft_lot_payload(url, str(exc))

    is_uk_url = "copart.co.uk" in canonical.lower()
    try:
        platform = detect_platform(canonical)
    except ValueError as exc:
        return soft_lot_payload(canonical, str(exc))

    # 1) Seed from URL so UK location is never empty
    result: dict[str, Any] = soft_lot_payload(canonical, "")
    result.pop("error", None)
    if is_uk_url:
        result = apply_uk_url_yard(result, canonical)

    # 2) Merge catalog if present — do NOT return early
    try:
        from_store = lookup_in_production_catalog(canonical)
    except Exception as exc:
        logger.warning("catalog lookup failed: %s", exc)
        from_store = None

    if from_store and (
        from_store.get("bid") or from_store.get("make") or from_store.get("lotNumber")
    ):
        result = _merge_fields(result, from_store)
        for key in ("via", "lot_id", "slug", "region", "source", "auction_platform", "images"):
            if from_store.get(key) is not None:
                result[key] = from_store[key]
        result["ok"] = True
        result["via"] = str(result.get("via") or "catalog")
        if is_uk_url or _is_uk_payload(result):
            result = apply_uk_url_yard(result, canonical)

    # 3) ALWAYS live bid from Copart Solr (UK + USA) — catalog bid is stale
    live_bid = False
    is_usa = (not is_uk_url) and platform in ("copart", "iaai", "bidcars")
    if (is_uk_url or platform == "copart") and _remaining() > 1.0:
        try:
            hit = await asyncio.wait_for(
                _fetch_copart_via_agent_tab(canonical),
                timeout=min(7.0, _remaining()),
            )
            if hit:
                live_bid_val = hit.get("bid")
                result = _merge_fields(result, hit)
                if live_bid_val is not None and float(live_bid_val or 0) > 0:
                    result["bid"] = float(live_bid_val)
                    result["bidLive"] = True
                    live_bid = True
                result["ok"] = True
                result["via"] = str(hit.get("via") or "agent_tab")
                if is_uk_url or _is_uk_payload(result):
                    result = apply_uk_url_yard(result, canonical)
            elif is_uk_url or _is_uk_payload(result):
                enriched = await asyncio.wait_for(
                    _enrich_uk_via_agent_tab(canonical, result),
                    timeout=min(5.0, _remaining()),
                )
                if enriched:
                    if enriched.get("bid") is not None and float(enriched.get("bid") or 0) > 0:
                        live_bid = True
                        enriched["bidLive"] = True
                    result = apply_uk_url_yard(enriched, canonical)
        except Exception as exc:
            logger.warning("live copart bid refresh skipped: %s", exc)

    # 4) Chrome — ALWAYS for USA (IAAI / Bid.cars / Copart.com), also UK if no live bid
    need_chrome = (
        is_usa
        or not live_bid
        or (is_uk_url and not result.get("location"))
    )
    if need_chrome and _remaining() > 1.5:
        try:
            chrome = await asyncio.wait_for(
                _fetch_lot_via_chrome(canonical, optional=False),
                timeout=min(10.0, _remaining()),
            )
            if chrome and (chrome.get("bid") or chrome.get("make") or chrome.get("location")):
                chrome_bid = chrome.get("bid")
                result = _merge_fields(result, chrome)
                if chrome_bid is not None and float(chrome_bid or 0) > 0:
                    result["bid"] = float(chrome_bid)
                    result["bidLive"] = True
                    live_bid = True
                for key in ("via", "region", "source", "auction_platform", "images", "bodyStyle"):
                    if chrome.get(key) is not None:
                        result[key] = chrome[key]
                result["ok"] = True
                result.setdefault("region", "usa" if is_usa else result.get("region"))
                if is_uk_url or _is_uk_payload(result):
                    result = apply_uk_url_yard(result, canonical)
        except Exception as exc:
            logger.warning("chrome lot-from-url failed: %s", exc)

    if live_bid:
        result["bidLive"] = True
    elif result.get("bid") is not None:
        result.setdefault("bidLive", False)

    # 5) Finalize
    if is_uk_url or _is_uk_payload(result):
        result = apply_uk_url_yard(result, canonical)
        if result.get("location") or result.get("make") or result.get("lotNumber"):
            result["ok"] = True
        return result

    # USA: mark ok if we got a usable lot (catalog + live/chrome)
    if result.get("bid") or result.get("make") or result.get("lotNumber") or result.get("location"):
        result["ok"] = True
        result.setdefault("region", "usa")
    return await _finalize_lot_payload(result, _remaining())
