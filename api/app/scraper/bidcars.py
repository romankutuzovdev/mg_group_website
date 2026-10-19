"""Full Bid.cars scrape: every search result → open lot page → all fields + photos.

Search entry:
  https://bid.cars/en/search/results?...&status=All&type=Automobile...

Requires headed Chrome (Cloudflare). For each automobile:
  1) collect lot URLs from search pages
  2) open https://bid.cars/en/lot/...
  3) extract specs, Estimated cost, bid, VIN, sale doc, keys, drive status
  4) collect the lot gallery (not similar vehicles)
  5) upsert into the catalog with photosEnrichedAt set
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from playwright.async_api import Page, Response

from app.data.store import lot_store
from app.scraper.mapper import map_bidcars_row
from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.bidcars")

SEARCH_URL = (
    "https://bid.cars/en/search/results"
    "?search-type=filters&status=All&type=Automobile"
    "&make=All&model=All&year-from=1900&year-to=2027&auction-type=All"
)

# Collect lot links + cover image from search cards (works without XHR JSON).
_COLLECT_LINKS_JS = r"""
() => {
  const seen = new Set();
  const out = [];
  const isCarImg = (s) => {
    if (!s || !/^https?:\/\//i.test(s)) return false;
    if (!/images\.bid\.cars|pluto\.bid\.car|cdn\.bid\.cars|mercury\.bid/i.test(s)) return false;
    if (/\/img\/|\/upd\/|\/map\/|opineo|rating|logo|flag|\.svg(?:$|\?)/i.test(s)) return false;
    return true;
  };
  const pickImg = (root) => {
    if (!root) return '';
    for (const el of root.querySelectorAll('img')) {
      const u = (el.currentSrc || el.getAttribute('src') || el.getAttribute('data-src')
        || el.getAttribute('data-original') || el.getAttribute('data-lazy') || '').trim();
      if (isCarImg(u)) return u.split(' ')[0];
    }
    return '';
  };
  for (const a of document.querySelectorAll('a[href*="/lot/"]')) {
    const href = (a.href || '').split('?')[0];
    const m = href.match(/\/lot\/((?:\d+-)?\d+)(?:\/|$)/i);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const root = a.closest(
      'article, li, [class*="lot"], [class*="Lot"], [class*="vehicle"], [class*="Vehicle"], [class*="card"], [class*="result"], [class*="Result"]'
    ) || a.parentElement;
    let image = pickImg(root) || pickImg(a);
    const title = ((a.getAttribute('title') || '') + ' ' + (a.innerText || ''))
      .replace(/\s+/g, ' ').trim().slice(0, 140);
    out.push({ lotNumber: m[1], url: href, image, title });
  }
  return out;
}
"""

_NEXT_JS = """
() => {
  const nodes = Array.from(document.querySelectorAll('a, button'));
  const next = nodes.find((el) => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const cls = String(el.className || '');
    if (/disabled/i.test(cls)) return false;
    const label = (
      (el.innerText || '') + ' ' +
      (el.getAttribute('aria-label') || '') + ' ' +
      (el.getAttribute('rel') || '') + ' ' +
      cls
    ).toLowerCase();
    return /\\bnext\\b|далее|следующ|›|»/.test(label);
  });
  if (!next) return false;
  next.click();
  return true;
}
"""

# Full lot page → specs + car gallery only (labels match Bid.cars lot sheet).
_EXTRACT_DETAIL_JS = r"""
() => {
  const money = (raw) => {
    const m = String(raw || '').replace(/[\s,]/g, '').match(/([\d]+(?:\.\d+)?)/);
    return m ? m[1] : '';
  };
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const blank = (s) => {
    const t = clean(s);
    if (!t || t === '-' || t === '—' || /^n\/?a$/i.test(t) || /^unknown$/i.test(t)
      || /^no information$/i.test(t) || /^none$/i.test(t)) return '';
    return t;
  };

  const inSimilar = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const mark = ((n.id || '') + ' ' + (typeof n.className === 'string' ? n.className : '')).toLowerCase();
      if (/similar|related|recommend|also-like|other-lot|sold.?before|shipping|delivery|calculator/i.test(mark)) return true;
      n = n.parentElement;
    }
    return false;
  };

  const href = location.href.split('?')[0].replace(/bid\.cars\/ru\//i, 'bid.cars/en/');
  const lotM = href.match(/\/lot\/((?:\d+-)?\d+)(?:\/|$)/i);
  const lotNumber = lotM ? lotM[1] : '';
  const lotDigits = lotNumber.replace(/^\d+-/, '');

  const isCarPhoto = (s) => {
    if (!s || !/^https?:\/\//i.test(s)) return false;
    if (!/images\.bid\.cars|pluto\.bid\.car|cdn\.bid\.cars|mercury\.bid/i.test(s)) return false;
    if (/\/img\/|\/upd\/|\/map\/|opineo|rating|contact\/people|sprite|logo|flag|\.svg(?:$|\?)/i.test(s)) return false;
    // Prefer photos that belong to this lot / look like gallery frames (...-1.jpg)
    if (lotDigits && s.includes(lotDigits)) return true;
    if (/\/\d{4}-[A-Za-z0-9-]+-\d+\.(?:jpe?g|webp|png)(?:$|\?)/i.test(s)) return true;
    if (/\/(?:0-)?\d+\/.+\.(?:jpe?g|webp|png)(?:$|\?)/i.test(s)) return true;
    return false;
  };

  const pushImg = (urls, u) => {
    if (!u || typeof u !== 'string') return;
    let s = u.trim().split(' ')[0].replace(/&amp;/g, '&');
    if (!isCarPhoto(s)) return;
    s = s.replace(/\/thumb(?:nail)?s?\//i, '/');
    if (!urls.includes(s)) urls.push(s);
  };

  const images = [];
  const imgSel = [
    '[class*="gallery"] img', '[class*="Gallery"] img',
    '[class*="fotorama"] img', '[class*="swiper"] img',
    '[class*="photo"] img', '[class*="Photo"] img',
    '[class*="carousel"] img',
    'img[src*="images.bid.cars"]', 'img[data-src*="images.bid.cars"]',
    'img[src*="pluto.bid"]', 'img[data-src*="pluto.bid"]',
  ].join(',');
  document.querySelectorAll(imgSel).forEach((el) => {
    if (inSimilar(el)) return;
    pushImg(images, el.currentSrc || el.getAttribute('src') ||
      el.getAttribute('data-src') || el.getAttribute('data-original') ||
      el.getAttribute('data-lazy'));
  });
  document.querySelectorAll('source[srcset], img[srcset]').forEach((el) => {
    if (inSimilar(el)) return;
    const ss = el.getAttribute('srcset') || '';
    pushImg(images, ss.split(',')[0]?.trim()?.split(/\s+/)[0]);
  });
  document.querySelectorAll('meta[property="og:image"], meta[name="og:image"]').forEach((m) => {
    pushImg(images, m.getAttribute('content'));
  });
  try {
    document.querySelectorAll('script[type="application/ld+json"]').forEach((sc) => {
      const j = JSON.parse(sc.textContent || '{}');
      for (const node of (Array.isArray(j) ? j : [j])) {
        const img = node && node.image;
        if (typeof img === 'string') pushImg(images, img);
        else if (Array.isArray(img)) img.forEach((u) => pushImg(images, u));
      }
    });
  } catch (e) {}

  const html = document.documentElement ? document.documentElement.innerHTML : '';
  const reImg = /https?:\/\/(?:pluto\.bid\.car|images\.bid\.cars)[^"'\\s<>]+/gi;
  let mm;
  while ((mm = reImg.exec(html))) pushImg(images, mm[0]);

  const bodyText = clean(document.body ? document.body.innerText : '');
  const vinM = bodyText.match(/\bVIN\b[:\s]*([A-HJ-NPR-Z0-9]{17})\b/i)
    || href.match(/([A-HJ-NPR-Z0-9]{17})(?:\/?$)/i);
  const vin = vinM ? vinM[1].toUpperCase() : '';

  const h1 = clean(
    (document.querySelector('h1') && document.querySelector('h1').innerText) ||
    (document.querySelector('meta[property="og:title"]') &&
      document.querySelector('meta[property="og:title"]').getAttribute('content')) ||
    document.title || ''
  );
  const title = h1.replace(/\s*[|\-–].*bid\.cars.*/i, '').trim();

  // Bid.cars sheet: "Primary damage Rear" / "Fuel Type Gasoline" (label then value).
  const field = (label) => {
    const re = new RegExp(
      '(?:^|\\n)\\s*' + label + '\\s*[:\\n]?\\s*([^\\n]{1,120})',
      'i'
    );
    const m = bodyText.match(re);
    return m ? blank(m[1]) : '';
  };

  const labelMap = {};
  document.querySelectorAll('dt').forEach((dt) => {
    const key = clean(dt.innerText).toLowerCase().replace(/:$/, '');
    const dd = dt.nextElementSibling;
    if (key && dd) labelMap[key] = blank(dd.innerText);
  });
  document.querySelectorAll('tr').forEach((tr) => {
    const cells = tr.querySelectorAll('th, td');
    if (cells.length >= 2) {
      const key = clean(cells[0].innerText).toLowerCase().replace(/:$/, '');
      if (key) labelMap[key] = blank(cells[1].innerText);
    }
  });
  document.querySelectorAll('li, [class*="spec"] div, [class*="detail"] div, [class*="info"] div').forEach((el) => {
    const t = clean(el.innerText);
    if (t.length > 160) return;
    const m = t.match(/^([A-Za-z][A-Za-z0-9 /&-]{1,40})\s*[:\n]\s*(.+)$/);
    if (m) labelMap[m[1].toLowerCase()] = blank(m[2]);
  });

  const pick = (...keys) => {
    for (const k of keys) {
      const fromText = field(k);
      if (fromText) return fromText;
      const kk = k.toLowerCase();
      if (labelMap[kk]) return labelMap[kk];
      for (const [lk, lv] of Object.entries(labelMap)) {
        if (lk === kk || lk.startsWith(kk + ' ') || lk.endsWith(' ' + kk)) return lv;
      }
    }
    return '';
  };

  const estM = bodyText.match(
    /(?:estimated\s*cost|ориентировочн\w*\s*стоимост\w*|примерн\w*\s*стоимост\w*)\s*:?\s*\$?\s*([\d\s,]+(?:\.\d+)?)\s*[-–—]\s*\$?\s*([\d\s,]+(?:\.\d+)?)/i
  ) || html.match(
    /"(?:estimatedMin|estimated_min|estimatedAmount1)"\s*:\s*"?([\d.]+)[\s\S]{0,80}"?(?:estimatedMax|estimated_max|estimatedAmount2)"\s*:\s*"?([\d.]+)/i
  );
  const bidM = bodyText.match(
    /(?:current\s*bid|pre-?bid|final\s*bid)\s*:?\s*\$\s*([\d,]+(?:\.\d+)?)/i
  );
  const buyM = bodyText.match(/buy\s*now\s*:?\s*\$\s*([\d,]+(?:\.\d+)?)/i);

  const sold = /status\s*:\s*(sold|ended|archived)/i.test(bodyText)
    || /\bfinal\s*bid\b/i.test(bodyText)
    || /sold\s+for|auction ended/i.test(bodyText);

  const odoRaw = pick('Odometer', 'odometer', 'mileage') ||
    (bodyText.match(/([\d\s,]+)\s*mi(?:les)?(?:\s*\(|\b)/i) || [])[1] || '';
  const odo = parseInt(String(odoRaw).replace(/[^\d]/g, ''), 10) || 0;

  const startCode = pick('Start code', 'Start Code', 'start code') || '';
  const keyInfo = pick('Key', 'Keys', 'Key info', 'key') || '';
  const hasKeys = /present|yes|available/i.test(keyInfo);
  const runs = /run\s*(?:and|&|\/)?\s*drive|starts|runs/i.test(startCode);

  let drive = pick('Drive Type', 'Drive Line Type', 'Drive', 'Drivetrain') || '';
  if (/all\s*wheel|awd/i.test(drive)) drive = 'AWD';
  else if (/4\s*x\s*4|4wd|four\s*wheel/i.test(drive)) drive = '4WD';
  else if (/front\s*wheel|fwd|4x2/i.test(drive)) drive = 'FWD';
  else if (/rear\s*wheel|rwd/i.test(drive)) drive = 'RWD';

  let fuel = pick('Fuel Type', 'Fuel') || '';
  if (/gasolin|petrol/i.test(fuel)) fuel = 'Gasoline';
  else if (/diesel/i.test(fuel)) fuel = 'Diesel';
  else if (/hybrid/i.test(fuel)) fuel = 'Hybrid';
  else if (/electric/i.test(fuel)) fuel = 'Electric';
  else if (/flex|e85/i.test(fuel)) fuel = 'Gasoline';

  let transmission = pick('Transmission') || '';
  if (/automatic|a\/t|\bat\b/i.test(transmission)) transmission = 'Automatic';
  else if (/manual|m\/t|\bmt\b/i.test(transmission)) transmission = 'Manual';
  else if (/cvt|variator/i.test(transmission)) transmission = 'CVT';

  return {
    lotNumber,
    url: href,
    title,
    vin: vin || pick('VIN'),
    price: money(bidM && bidM[1]) || money(pick('Current bid', 'Prebid', 'Final bid')),
    buyNowPrice: money(buyM && buyM[1]) || money(pick('Buy now')),
    estimatedMin: estM ? money(estM[1]) : '',
    estimatedMax: estM ? money(estM[2]) : '',
    sold,
    location: pick('Location', 'Yard', 'Branch') || '',
    odometer: odo,
    primaryDamage: pick('Primary damage', 'Primary Damage') || '',
    secondaryDamage: pick('Secondary damage', 'Secondary Damage') || '',
    lossType: pick('Loss', 'Loss type') || '',
    saleDocument: pick('Sale Document', 'Sale document') || '',
    seller: pick('Seller') || '',
    engine: pick('Engine') || '',
    transmission,
    fuel,
    drive,
    exteriorColor: pick('Exterior color', 'Exterior Color', 'Exterior', 'Color') || '',
    bodyStyle: pick('Body Style', 'Body style', 'Typ') || '',
    hasKeys,
    runsDrives: runs,
    startCode,
    keyInfo,
    auctionDate: pick('Auction date', 'Prebid close time', 'Sale date') || '',
    images,
    image: images[0] || '',
    text: bodyText.slice(0, 1600),
  };
}
"""


def _with_page(url: str, page: int) -> str:
    parts = urlparse(url)
    qs = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "page"]
    qs.append(("page", str(page)))
    return urlunparse(parts._replace(query=urlencode(qs)))


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    raw = re.sub(r"[^\d.]", "", str(value).replace(",", ""))
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _merge_detail(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key, val in extra.items():
        if val is None or val == "" or val == []:
            continue
        if key == "images" and isinstance(val, list):
            prev = list(out.get("images") or [])
            seen = set(prev)
            for u in val:
                s = str(u or "").strip()
                if s.startswith("http") and s not in seen:
                    seen.add(s)
                    prev.append(s)
            out["images"] = prev[:60]
            if prev and not out.get("image"):
                out["image"] = prev[0]
            continue
        if not out.get(key):
            out[key] = val
    return out


def _row_from_json_item(item: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    lot = str(
        item.get("lot")
        or item.get("lotNumber")
        or item.get("lot_number")
        or item.get("id")
        or ""
    ).strip()
    if not lot:
        return None
    name = str(
        item.get("name")
        or item.get("title")
        or item.get("nameShort")
        or item.get("tag")
        or ""
    ).strip()
    detail = str(item.get("detailUrl") or item.get("url") or "").strip()
    if not detail:
        tag = str(item.get("tag") or name.replace(" ", "-"))
        detail = f"https://bid.cars/en/lot/{lot}/{tag}".rstrip("/")

    images: list[str] = []
    for key in ("imagesLarge", "images_large", "photos_large", "images", "photos"):
        val = item.get(key)
        if isinstance(val, list):
            for u in val:
                s = str(u or "").strip()
                if s.startswith("http") and s not in images:
                    images.append(s)
            if images:
                break

    status = str(
        item.get("searchStatus") or item.get("search_status") or item.get("status") or ""
    ).lower()
    sold = status in {"sold", "archived", "ended", "3", "4"} or bool(item.get("finalBid"))
    bid = (
        _as_float(item.get("prebidPrice"))
        or _as_float(item.get("currentBid"))
        or _as_float(item.get("finalBid"))
        or 0.0
    )
    est_min = _as_float(item.get("estimatedMin")) or _as_float(item.get("estimatedAmount1"))
    est_max = _as_float(item.get("estimatedMax")) or _as_float(item.get("estimatedAmount2"))

    return {
        "lotNumber": lot,
        "url": detail,
        "title": name,
        "vin": str(item.get("vin") or ""),
        "price": str(int(bid)) if bid else "",
        "buyNowPrice": str(int(v)) if (v := _as_float(item.get("buyNowPrice") or item.get("buy_now_price"))) else "",
        "estimatedMin": str(int(est_min)) if est_min is not None else "",
        "estimatedMax": str(int(est_max)) if est_max is not None else "",
        "sold": sold,
        "location": str(item.get("location") or ""),
        "odometer": item.get("odometer") or item.get("odometer_miles") or 0,
        "primaryDamage": str(item.get("primaryDamage") or item.get("primary_damage") or ""),
        "secondaryDamage": str(item.get("secondaryDamage") or ""),
        "saleDocument": str(item.get("saleDocument") or item.get("sale_document") or ""),
        "seller": str(item.get("seller") or ""),
        "engine": str(item.get("engine") or ""),
        "transmission": str(item.get("transmission") or ""),
        "fuel": str(item.get("fuelType") or item.get("fuel") or ""),
        "drive": str(item.get("driveType") or item.get("drive") or ""),
        "exteriorColor": str(item.get("color") or item.get("exteriorColor") or ""),
        "hasKeys": bool(
            re.search(r"present|yes", str(item.get("keyInfo") or item.get("key_info") or ""), re.I)
        ),
        "runsDrives": bool(
            re.search(r"run|drive|starts", str(item.get("startCode") or item.get("start_code") or ""), re.I)
        ),
        "auctionDate": str(
            item.get("prebidCloseTime")
            or item.get("prebid_close_time")
            or item.get("auctionDate")
            or ""
        ),
        "images": images[:60],
        "image": images[0] if images else "",
        "fromJson": True,
    }


def _extract_vehicles_from_payload(payload: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []

    def walk(node: Any, depth: int = 0) -> None:
        if depth > 8 or node is None:
            return
        if isinstance(node, list):
            for item in node:
                if isinstance(item, dict) and (
                    item.get("lot")
                    or item.get("lotNumber")
                    or item.get("estimatedMin") is not None
                    or item.get("estimatedAmount1") is not None
                ):
                    row = _row_from_json_item(item)
                    if row:
                        found.append(row)
                else:
                    walk(item, depth + 1)
            return
        if isinstance(node, dict):
            for key in ("vehicles", "items", "results", "data", "lots", "list", "content", "lot"):
                if key in node:
                    walk(node[key], depth + 1)
            if "lot" in node and isinstance(node["lot"], (str, int)):
                row = _row_from_json_item(node)
                if row:
                    found.append(row)

    walk(payload)
    return found


class _JsonCatcher:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()

    async def on_response(self, response: Response) -> None:
        try:
            ctype = (response.headers.get("content-type") or "").lower()
            url = response.url or ""
            if response.status >= 400:
                return
            if "json" not in ctype and "/lot" not in url and "/search" not in url:
                return
            if re.search(r"\.(js|css|png|jpe?g|webp|svg|woff2?)(?:$|\?)", url, re.I):
                return
            raw = await response.body()
            if not raw or len(raw) < 40 or len(raw) > 8_000_000:
                return
            text = raw.decode("utf-8", errors="ignore").strip()
            if not text or text[0] not in "{[":
                return
            low = text.lower()
            if "estimated" not in low and '"lot"' not in text and "lotnumber" not in low:
                return
            payload = json.loads(text)
        except Exception:
            return
        rows = _extract_vehicles_from_payload(payload)
        if not rows:
            return
        async with self._lock:
            self.rows.extend(rows)

    def take(self) -> list[dict[str, Any]]:
        rows, self.rows = self.rows, []
        return rows

    def take_for_lot(self, lot_number: str) -> dict[str, Any] | None:
        rows = self.take()
        for row in reversed(rows):
            if str(row.get("lotNumber") or "") == str(lot_number):
                return row
        return rows[-1] if len(rows) == 1 else None


async def _blocked_reason(tab: Page) -> str:
    return await tab.evaluate(
        """() => {
          const t = (document.body && document.body.innerText) || '';
          const hasLots = !!document.querySelector('a[href*="/lot/"]');
          const hasDetail = !!document.querySelector('h1') && /\\/lot\\//i.test(location.pathname);
          if (hasLots || hasDetail || /estimated\\s*cost/i.test(t)) return '';
          if (/just a moment|cf-challenge|attention required|cloudflare|подтвердите, что вы человек|проверк[аи] безопасности/i.test(t))
            return 'cloudflare';
          if (/access denied/i.test(t)) return 'access_denied';
          if (t.length < 200) return 'loading';
          return '';
        }"""
    )


async def _wait_ready(tab: Page, *, seconds: int = 45) -> str:
    blocked = "loading"
    for _ in range(seconds):
        blocked = await _blocked_reason(tab)
        if blocked != "loading":
            return blocked
        await tab.wait_for_timeout(1000)
    return "empty_page"


async def _scroll_page(tab: Page, steps: int = 4) -> None:
    for _ in range(steps):
        await tab.evaluate(
            "() => window.scrollBy(0, Math.max(400, window.innerHeight * 0.85))"
        )
        await tab.wait_for_timeout(280)


def _upsert_detail(row: dict[str, Any], seen: set[str]) -> tuple[int, int]:
    ln = str(row.get("lotNumber") or "").strip()
    if not ln:
        return 0, 0
    imgs = row.get("images") if isinstance(row.get("images"), list) else []
    if imgs and not row.get("image"):
        row["image"] = imgs[0]
    # Mark gallery as fetched so photo enricher can skip full re-walk.
    if imgs and len(imgs) >= 2:
        row["photosEnrichedAt"] = datetime.now(timezone.utc).isoformat()
    lot = map_bidcars_row(row)
    if not lot:
        return 0, 0
    seen.add(ln)
    return lot_store.upsert_many([lot])


async def _scrape_one_lot(
    tab: Page,
    catcher: _JsonCatcher,
    *,
    lot_number: str,
    url: str,
) -> dict[str, Any] | None:
    try:
        await tab.goto(url, wait_until="domcontentloaded", timeout=35_000)
    except Exception as exc:
        logger.warning("bidcars lot %s goto: %s", lot_number, exc)
        return None
    blocked = await _wait_ready(tab, seconds=12)
    if blocked == "cloudflare":
        return {"_blocked": True, "reason": "cloudflare"}
    if blocked and blocked != "":
        logger.warning("bidcars lot %s: %s", lot_number, blocked)

    await _scroll_page(tab, steps=3)
    await tab.wait_for_timeout(250)

    # Click gallery thumbs / next to force lazy images
    try:
        await tab.evaluate(
            """() => {
              const thumbs = Array.from(document.querySelectorAll(
                '[class*="gallery"] img, [class*="thumb"] img, [class*="fotorama"] img, button'
              )).slice(0, 12);
              for (const el of thumbs) { try { el.click(); } catch (e) {} }
            }"""
        )
        await tab.wait_for_timeout(500)
    except Exception:
        pass

    detail: dict[str, Any] = {}
    try:
        detail = await tab.evaluate(_EXTRACT_DETAIL_JS) or {}
    except Exception as exc:
        logger.warning("bidcars lot %s extract: %s", lot_number, exc)

    xhr = catcher.take_for_lot(lot_number)
    if xhr:
        detail = _merge_detail(detail, xhr)
    if not detail.get("lotNumber"):
        detail["lotNumber"] = lot_number
    if not detail.get("url"):
        detail["url"] = url

    imgs = detail.get("images") if isinstance(detail.get("images"), list) else []
    if not imgs and not detail.get("image"):
        logger.warning("bidcars lot %s: no photos", lot_number)
        return None
    return detail


def _seed_row_from_link(item: dict[str, Any]) -> dict[str, Any] | None:
    """Build a catalog seed from XHR card and/or DOM link fields."""
    ln = str(item.get("lotNumber") or "").strip()
    url = str(item.get("url") or "").strip()
    if not ln or not url:
        return None
    card = item.get("_card") if isinstance(item.get("_card"), dict) else {}
    seed: dict[str, Any] = dict(card) if card else {}
    seed.setdefault("lotNumber", ln)
    seed.setdefault("url", url)
    if item.get("title") and not seed.get("title"):
        seed["title"] = str(item.get("title") or "").strip()
    img = str(seed.get("image") or item.get("image") or "").strip()
    imgs = seed.get("images") if isinstance(seed.get("images"), list) else []
    if img and img not in imgs:
        imgs = [img] + list(imgs)
    if not imgs and img:
        imgs = [img]
    if not imgs:
        return None
    seed["image"] = imgs[0]
    seed["images"] = imgs
    seed.pop("photosEnrichedAt", None)
    return seed


async def scrape_bidcars(
    *,
    max_pages: int = 0,
    sold_pages: int = 0,
    headless: bool = True,
    timeout_ms: int = 60000,
    page: Page | None = None,
    browser: Any = None,
    detail_limit: int | None = None,
    on_progress: Any = None,
) -> list[dict[str, Any]]:
    """Seed USA catalog from search cards, then enrich a capped set of lot pages.

    Full-catalog detail crawl (every lot) hung shared Chrome for 45+ minutes with
    usa=0 when XHR cards were missing. Prefer fast DOM/XHR seeds each cycle.
    """
    del sold_pages, timeout_ms
    from app.config import get_settings

    settings = get_settings()
    session = TabSession()
    tab = await session.start(page=page, browser=browser, headless=headless)
    try:
        await tab.bring_to_front()
    except Exception:
        pass

    catcher = _JsonCatcher()
    pending_resp: set[asyncio.Task] = set()

    def _track_resp(response: Response) -> None:
        task = asyncio.create_task(catcher.on_response(response))
        pending_resp.add(task)
        task.add_done_callback(pending_resp.discard)

    tab.on("response", _track_resp)

    # 0 in env historically meant "whole catalog" — that wedged the agent.
    safety_pages = max_pages if max_pages and max_pages > 0 else 20
    max_details = (
        detail_limit
        if detail_limit is not None
        else int(getattr(settings, "scraper_bidcars_detail_per_cycle", 40) or 40)
    )
    max_details = max(0, min(200, max_details))

    seen: set[str] = set()
    total_upserted = 0
    total_new = 0
    empty_search = 0
    cloudflare_hits = 0
    details_done = 0

    def _tick(*, page_idx: int = 0) -> None:
        if not callable(on_progress):
            return
        try:
            on_progress(
                page=page_idx,
                upserted=total_upserted,
                new=total_new,
                details=details_done,
                unique=len(seen),
            )
        except Exception:
            pass

    try:
        logger.info(
            "bidcars → seed+detail crawl pages≤%s details≤%s %s",
            safety_pages,
            max_details,
            SEARCH_URL,
        )
        await tab.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=45_000)
        blocked = await _wait_ready(tab, seconds=25)
        if blocked == "cloudflare":
            logger.error("bidcars Cloudflare — solve captcha in Chrome, then wait")
            return [{"_blocked": True, "reason": "cloudflare"}]
        if blocked:
            return [{"_blocked": True, "reason": blocked}]

        for page_idx in range(1, safety_pages + 1):
            await _scroll_page(tab, steps=3)
            await tab.wait_for_timeout(300)

            xhr_rows = catcher.take()
            links: list[dict[str, Any]] = []
            seen_page: set[str] = set()
            for row in xhr_rows:
                ln = str(row.get("lotNumber") or "")
                url = str(row.get("url") or "")
                if ln and url and ln not in seen_page:
                    seen_page.add(ln)
                    links.append({"lotNumber": ln, "url": url, "_card": row})
            try:
                dom_links = await asyncio.wait_for(tab.evaluate(_COLLECT_LINKS_JS), timeout=15)
            except Exception:
                dom_links = []
            for item in dom_links or []:
                ln = str(item.get("lotNumber") or "")
                url = str(item.get("url") or "")
                if not ln or not url or ln in seen_page:
                    continue
                seen_page.add(ln)
                # Merge DOM cover into existing XHR row when possible
                existing = next((x for x in links if x["lotNumber"] == ln), None)
                if existing is not None:
                    if item.get("image") and not (
                        isinstance(existing.get("_card"), dict)
                        and (existing["_card"].get("image") or existing["_card"].get("images"))
                    ):
                        existing["image"] = item.get("image")
                        existing["title"] = item.get("title") or existing.get("title")
                else:
                    links.append(
                        {
                            "lotNumber": ln,
                            "url": url,
                            "image": item.get("image") or "",
                            "title": item.get("title") or "",
                        }
                    )

            if not links:
                empty_search += 1
                logger.info("bidcars search page %s: no links", page_idx)
            else:
                empty_search = 0
                logger.info(
                    "bidcars search page %s: %s lots → seed then detail≤%s",
                    page_idx,
                    len(links),
                    max_details - details_done,
                )

            # Fast seed from XHR + DOM covers so USA leaves 0 immediately.
            seeded_now = 0
            for item in links:
                seed = _seed_row_from_link(item)
                if not seed:
                    continue
                up, new = _upsert_detail(seed, set())
                if up:
                    seeded_now += 1
                    total_upserted += up
                    total_new += new
            if seeded_now:
                logger.info("bidcars search page %s: seeded %s cards", page_idx, seeded_now)
                try:
                    lot_store.persist()
                except Exception as exc:
                    logger.warning("bidcars seed persist: %s", exc)
                _tick(page_idx=page_idx)

            # Detail pass — capped so one cycle cannot hang for hours.
            for item in links:
                if details_done >= max_details:
                    break
                ln = str(item.get("lotNumber") or "")
                if not ln or ln in seen:
                    continue
                url = str(item.get("url") or "")
                card = item.get("_card") if isinstance(item.get("_card"), dict) else {}
                seed_fallback = _seed_row_from_link(item)

                try:
                    detail = await asyncio.wait_for(
                        _scrape_one_lot(tab, catcher, lot_number=ln, url=url),
                        timeout=55.0,
                    )
                except asyncio.TimeoutError:
                    logger.warning("bidcars lot %s detail timeout — keep seed", ln)
                    detail = None
                details_done += 1

                if detail and detail.get("_blocked"):
                    cloudflare_hits += 1
                    if cloudflare_hits >= 2:
                        logger.error("bidcars blocked again — end cycle with seeds")
                        try:
                            lot_store.persist()
                        except Exception:
                            pass
                        return [{"_blocked": True, "reason": "cloudflare"}]
                    continue
                cloudflare_hits = 0
                if not detail:
                    detail = seed_fallback
                    if not detail:
                        continue
                elif card:
                    detail = _merge_detail(detail, card)
                elif seed_fallback:
                    detail = _merge_detail(detail, seed_fallback)

                upserted, new_count = _upsert_detail(detail, seen)
                total_upserted += upserted
                total_new += new_count
                if upserted:
                    imgs = len(detail.get("images") or [])
                    logger.info(
                        "bidcars lot %s ok photos=%s est=%s-%s bid=%s",
                        ln,
                        imgs,
                        detail.get("estimatedMin") or "?",
                        detail.get("estimatedMax") or "?",
                        detail.get("price") or "?",
                    )
                _tick(page_idx=page_idx)
                await tab.wait_for_timeout(200)

            try:
                lot_store.persist()
            except Exception as exc:
                logger.warning("bidcars persist: %s", exc)

            if details_done >= max_details:
                logger.info(
                    "bidcars detail cap %s reached — end cycle (seeds already in store)",
                    max_details,
                )
                break

            if empty_search >= 3:
                logger.info("bidcars done: three empty search pages")
                break

            search_here = _with_page(SEARCH_URL, page_idx)
            try:
                if "search/results" not in (tab.url or ""):
                    await tab.goto(
                        search_here, wait_until="domcontentloaded", timeout=35_000
                    )
                    await _wait_ready(tab, seconds=12)
            except Exception:
                pass

            clicked = False
            try:
                clicked = bool(await tab.evaluate(_NEXT_JS))
            except Exception:
                clicked = False
            if clicked:
                await tab.wait_for_timeout(1000)
                blocked = await _wait_ready(tab, seconds=12)
                if blocked == "cloudflare":
                    return [{"_blocked": True, "reason": "cloudflare"}]
                continue

            nxt = _with_page(SEARCH_URL, page_idx + 1)
            try:
                await tab.goto(nxt, wait_until="domcontentloaded", timeout=35_000)
            except Exception as exc:
                logger.warning("bidcars next page goto: %s", exc)
                break
            blocked = await _wait_ready(tab, seconds=12)
            if blocked:
                logger.info("bidcars stop at search page %s: %s", page_idx + 1, blocked)
                break

        try:
            lot_store.persist()
        except Exception:
            pass
        logger.info(
            "bidcars complete: unique=%s upserted=%s new=%s details=%s",
            len(seen),
            total_upserted,
            total_new,
            details_done,
        )
        return [
            {
                "_ok": True,
                "upserted": total_upserted,
                "new": total_new,
                "unique": len(seen),
                "details": details_done,
            }
        ]
    except Exception as exc:
        logger.exception("bidcars scrape failed: %s", exc)
        return [{"_blocked": True, "reason": re.sub(r"\s+", " ", str(exc))[:180]}]
    finally:
        for task in list(pending_resp):
            task.cancel()
