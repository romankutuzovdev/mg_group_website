"""Map scraped auction rows → AuctionLot (all sources)."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app.data.store import slugify
from app.models.lots import AuctionLot
from app.scraper.iaai import parse_iaai_text_fields


def title_case(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(w[:1].upper() + w[1:].lower() for w in str(value).split())


def _clean_spec(value: Any, *, fallback: str = "—") -> str:
    text = str(value or "").strip()
    if not text or text in {"—", "-", "N/A", "NA", "Na", "null", "None", "UNKNOWN", "Unknown"}:
        return fallback
    return title_case(text) if text.isupper() or " " in text else text


# Canonical body styles written to AuctionLot.bodyStyle
_BODY_ALIASES: dict[str, str] = {
    "SEDAN": "Sedan",
    "4DR SEDAN": "Sedan",
    "4 DOOR": "Sedan",
    "4 DOOR SEDAN": "Sedan",
    "2DR SEDAN": "Sedan",
    "COUPE": "Coupe",
    "2DR COUPE": "Coupe",
    "CONVERTIBLE": "Convertible",
    "CABRIOLET": "Convertible",
    "HATCHBACK": "Hatchback",
    "HATCH": "Hatchback",
    "WAGON": "Wagon",
    "ESTATE": "Wagon",
    "SUV": "SUV",
    "SPORT UTILITY": "SUV",
    "SPORT UTILITY VEHICLE": "SUV",
    "CROSSOVER": "Crossover",
    "CUV": "Crossover",
    "PICKUP": "Pickup",
    "PICK UP": "Pickup",
    "PICK-UP": "Pickup",
    "TRUCK": "Pickup",
    "CREW CAB": "Pickup",
    "EXTENDED CAB": "Pickup",
    "REGULAR CAB": "Pickup",
    "VAN": "Van",
    "CARGO VAN": "Van",
    "PASSENGER VAN": "Van",
    "MINIVAN": "Minivan",
    "MINI VAN": "Minivan",
    "MOTORCYCLE": "Motorcycle",
    "ATV": "ATV",
    "BUS": "Bus",
    "CHASSIS": "Chassis",
    "CUTAWAY": "Chassis",
    # Encar / KR
    "세단": "Sedan",
    "해치백": "Hatchback",
    "쿠페": "Coupe",
    "컨버터블": "Convertible",
    "왜건": "Wagon",
    "왜건/승합": "Wagon",
    "승합": "Van",
    "밴": "Van",
    "픽업": "Pickup",
    "트럭": "Pickup",
}

_BODY_JUNK = re.compile(
    r"LOTFEATURE|^\s*\[|EXOTIC|UNKNOWN|N/?A|NULL|NONE|^—$|^-$",
    re.I,
)

_BODY_FROM_TEXT = re.compile(
    r"\b("
    r"SUV|CUV|Crossover|Sedan|Coupe|Convertible|Cabriolet|"
    r"Hatchback|Hatch|Wagon|Estate|Pickup|Pick[\s-]?Up|Truck|"
    r"Minivan|Mini[\s-]?Van|Cargo\s+Van|Passenger\s+Van|Van|"
    r"Motorcycle|ATV|Bus|Chassis"
    r")\b",
    re.I,
)

# Last-resort inference from make/model when auction omits body style
_MODEL_BODY_HINTS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\b(f-?15\d|f-?25\d|f-?35\d|silverado|sierra|ram\s*1[5-9]|ram\s*25|tacoma|tundra|ranger|colorado|canyon|ridgeline|gladiator|titan|frontier)\b", re.I), "Pickup"),
    (re.compile(r"\b(wrangler|bronco|4runner|x[1-7]\b|gle|glc|gls|q[3578]|rx|gx|lx|nx|mdx|rdx|highlander|pilot|pathfinder|explorer|expedition|traverse|atlas|tiguan|outback|forester|crosstrek|ascent|rav4|cr-?v|hr-?v|cx-?[5-9]|tucson|sportage|sorento|santa\s*fe|palisade|telluride|grand\s*cherokee|cherokee|compass|wagoneer|durango|cayenne|macan|dbx|qashqai|defender|discovery|range\s*rover)\b", re.I), "SUV"),
    (re.compile(r"\b(sprinter|transit|promaster|nv\d+|express|savana|odyssey|sienna|carnival|pacifica|town\s*&?\s*country|quest)\b", re.I), "Van"),
    (re.compile(r"\b(mustang|camaro|challenger|corvette|911|cayman|supra|brz|86|miata|mx-?5|tt\b|z4|rc\s?\d)\b", re.I), "Coupe"),
    (re.compile(r"\b(golf|polo|civic\s*hatch|fit|yaris|corsa|clio|focus\s*hatch|mazda3\s*hatch)\b", re.I), "Hatchback"),
    (re.compile(r"\b(camry|accord|altima|sentra|elantra|sonata|jetta|passat|mazda6|impreza|legacy|malibu|fusion|taurus|charger|300|a[456]|3\s*series|5\s*series|c[\s-]?class|e[\s-]?class|model\s*[3s])\b", re.I), "Sedan"),
)


def normalize_body_style(raw: Any) -> str | None:
    """Clean auction body-style string → canonical label, or None if junk/empty."""
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)):
        for item in raw:
            got = normalize_body_style(item)
            if got:
                return got
        return None
    text = str(raw).strip()
    if not text or _BODY_JUNK.search(text):
        return None
    # Copart sometimes returns "['SUV']" style strings
    text = text.strip("[]'\" ")
    if not text or _BODY_JUNK.search(text):
        return None
    key = re.sub(r"\s+", " ", text).strip().upper()
    if key in _BODY_ALIASES:
        return _BODY_ALIASES[key]
    # Partial contains
    for alias, label in _BODY_ALIASES.items():
        if alias in key and alias.isascii():
            return label
    # Accept short readable labels
    if len(text) <= 40 and re.fullmatch(r"[A-Za-z가-힣][A-Za-z0-9가-힣\s/\-]{1,38}", text):
        titled = title_case(text) if text.isascii() else text
        # Reject if it looks like a feature code
        if re.search(r"FEATURE|CODE|TYPE_\d", titled, re.I):
            return None
        return titled
    return None


def infer_body_style(*, make: str = "", model: str = "") -> str | None:
    blob = f"{make} {model}".strip()
    if not blob:
        return None
    for pattern, label in _MODEL_BODY_HINTS:
        if pattern.search(blob):
            return label
    return None


def extract_body_style(
    row: dict[str, Any],
    *extra_text: str,
    make: str = "",
    model: str = "",
    allow_infer: bool = True,
) -> str | None:
    """Pull body style from auction row fields, free text, or model hint."""
    keys = (
        "bsd",
        "bodyStyle",
        "body_style",
        "body",
        "BodyStyle",
        "BodyName",
        "bodyName",
        "BodyType",
        "bodyType",
        "FormType",
        "formType",
        "vehicleTypeDesc",
        "vehicleType",
        "vtd",
        "bt",
    )
    model_l = (model or "").strip().lower()
    for key in keys:
        if key not in row and key.lower() not in {k.lower() for k in row}:
            # still try exact
            pass
        got = normalize_body_style(row.get(key))
        if not got:
            # case-insensitive key fallback
            for rk, rv in row.items():
                if str(rk).lower() == key.lower():
                    got = normalize_body_style(rv)
                    break
        if got:
            if model_l and got.lower() == model_l:
                continue  # Encar BodyName often = model/trim
            if make and got.lower() == make.strip().lower():
                continue
            return got

    blob = " ".join(str(t) for t in extra_text if t)
    if blob:
        m = _BODY_FROM_TEXT.search(blob)
        if m:
            return normalize_body_style(m.group(1)) or title_case(m.group(1))
        for kr, en in _BODY_ALIASES.items():
            if not kr.isascii() and kr in blob:
                return en

    if allow_infer:
        return infer_body_style(make=make, model=model)
    return None


def _copart_transmission(row: dict[str, Any]) -> str:
    return _clean_spec(row.get("tmtp") or row.get("transmission") or row.get("trns"))


def _copart_fuel(row: dict[str, Any]) -> str:
    raw = str(row.get("ft") or row.get("fuel") or row.get("fuelType") or "").strip()
    if not raw:
        return "—"
    upper = raw.upper()
    if "DIESEL" in upper:
        return "Diesel"
    if "HYBRID" in upper:
        return "Hybrid"
    if "ELECTRIC" in upper or upper in {"EV", "BEV"}:
        return "Electric"
    if "FLEX" in upper:
        return "Flex Fuel"
    if "GAS" in upper or "PETROL" in upper or "BENZ" in upper:
        return "Gasoline"
    return _clean_spec(raw)


def _copart_drive(row: dict[str, Any]) -> str:
    raw = str(row.get("drv") or row.get("drive") or row.get("driveTrain") or "").strip()
    if not raw:
        return "—"
    upper = raw.upper()
    if "ALL" in upper or upper == "AWD":
        return "AWD"
    if "4X4" in upper or "4WD" in upper or "FOUR" in upper:
        return "4x4"
    if "FRONT" in upper or upper == "FWD":
        return "FWD"
    if "REAR" in upper or upper == "RWD":
        return "RWD"
    return _clean_spec(raw)


def _copart_has_keys(row: dict[str, Any]) -> bool:
    raw = str(row.get("hk") or row.get("keys") or row.get("hasKeys") or "").strip().upper()
    if raw in {"Y", "YES", "TRUE", "1"}:
        return True
    if raw in {"N", "NO", "FALSE", "0", "EXM", "EXEMPT"}:
        return False
    return False


def _copart_runs_drives(row: dict[str, Any]) -> bool:
    lcd = str(row.get("lcd") or row.get("hts") or row.get("lotCondition") or "")
    if re.search(r"RUN\s*&?\s*DRIVE|RUNS?\s*(AND|&)?\s*DRIVES?", lcd, re.I):
        return True
    if row.get("driveStatus"):
        return True
    # Copart lot condition codes: D = Drivable
    code = str(row.get("lcc") or row.get("lotCondCode") or row.get("dtc") or "").strip().upper()
    if code in {"D", "RD", "R&D"}:
        return True
    htsmn = str(row.get("htsmn") or "").strip().upper()
    if htsmn == "Y" and re.search(r"RUN", lcd, re.I):
        return True
    return False


def _infer_title_type(title_desc: str) -> str:
    t = (title_desc or "").upper()
    if "PARTS ONLY" in t or re.search(r"\bPO\b", t):
        return "parts_only"
    if "CLEAN" in t:
        return "clean"
    if "REBUILT" in t or "RECONSTRUCT" in t:
        return "rebuilt"
    return "salvage"


def parse_title_year_make_model(title: str) -> tuple[int, str, str]:
    t = (title or "").strip()
    m = re.match(r"^(\d{4})\s+(\S+)\s+(.+)$", t)
    if not m:
        return 2018, "Unknown", title_case(t) or "Unknown"
    return int(m.group(1)), title_case(m.group(2)), title_case(m.group(3).split("|")[0].strip())


def ms_to_iso(ms: Any) -> str:
    try:
        n = int(ms)
        if n > 1_000_000_000_000:
            return datetime.fromtimestamp(n / 1000, tz=timezone.utc).isoformat()
        if n > 1_000_000_000:
            return datetime.fromtimestamp(n, tz=timezone.utc).isoformat()
    except Exception:
        pass
    return (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()


def copart_image(url: str | None) -> str:
    if not url:
        return ""
    return url.replace("_thb.", "_ful.").replace("_ths.", "_ful.")


def map_copart_row(row: dict[str, Any]) -> AuctionLot | None:
    ln = str(row.get("ln") or row.get("lotNumberStr") or "").strip()
    if not ln:
        return None
    make = title_case(str(row.get("mkn") or "Unknown"))
    model = title_case(str(row.get("lmg") or row.get("lm") or "Unknown"))
    year = int(row.get("lcy") or 2018)
    img = copart_image(str(row.get("tims") or ""))
    if not img:
        return None

    dyn = row.get("dynamicLotDetails") or {}
    bid = float(dyn.get("currentBid") or row.get("hb") or 0)
    buy_now = float(row.get("bnp") or dyn.get("buyTodayBid") or 0) or None
    odo = int(row.get("orr") or 0)
    damage = title_case(str(row.get("dd") or "Unknown")) or "Unknown"
    location = str(row.get("yn") or "USA")
    vin = str(row.get("fv") or "*****************")
    engine = str(row.get("egn") or "").strip() or None
    title_desc = str(row.get("td") or row.get("tgd") or "Salvage")
    auction_date = ms_to_iso(row.get("ad") or row.get("lad"))

    slug = f"copart-{year}-{slugify(make)}-{slugify(model)}-{ln}"
    return AuctionLot(
        id=f"usa-copart-{ln}",
        slug=slug,
        region="usa",
        source="copart",
        lotNumber=ln,
        vin=vin,
        make=make,
        model=model,
        year=year,
        titleType=_infer_title_type(title_desc),  # type: ignore[arg-type]
        titleLabel=title_desc[:80] or "Salvage Certificate",
        primaryDamage=damage,
        secondaryDamage=title_case(str(row.get("sdd") or "")) or None,
        odometer=odo,
        odometerUnit="mi",
        currentBid=bid,
        buyNowPrice=buy_now,
        currency="USD",
        location=location,
        auctionDate=auction_date,
        imageUrl=img,
        imageUrls=[img],
        transmission=_copart_transmission(row),
        fuel=_copart_fuel(row),
        drive=_copart_drive(row),
        exteriorColor=title_case(str(row.get("clr") or "")) or "—",
        hasKeys=_copart_has_keys(row),
        runsDrives=_copart_runs_drives(row),
        engine=engine,
        bodyStyle=title_case(str(row.get("bsd") or "")) or None,
        lotUrl=f"https://www.copart.com/lot/{ln}",
    )


def map_copart_uk_row(row: dict[str, Any]) -> AuctionLot | None:
    """Copart UK search row (same Solr shape as USA) or DOM fallback."""
    ln = str(row.get("ln") or row.get("lotNumberStr") or row.get("id") or "").strip()
    if not ln:
        return None

    # DOM fallback shape
    if row.get("title") and not row.get("mkn"):
        year, make, model = parse_title_year_make_model(str(row.get("title") or ""))
        img = str(row.get("image") or "")
        if not img:
            return None
        text = str(row.get("text") or "")
        bid_m = re.search(r"£\s*([\d,]+)", text)
        bid = float(bid_m.group(1).replace(",", "")) if bid_m else 0.0
        cat_m = re.search(r"\bCat(?:egory)?\s*([ABNSCDXU])\b", text, re.I)
        return AuctionLot(
            id=f"uk-copart-{ln}",
            slug=f"copart-uk-{year}-{slugify(make)}-{slugify(model)}-{ln}",
            region="uk",
            source="copart_uk",
            lotNumber=ln,
            vin="*****************",
            make=make,
            model=model,
            year=year,
            titleType="salvage",
            titleLabel=f"Category {cat_m.group(1).upper()}" if cat_m else "Salvage",
            primaryDamage="Unknown",
            odometer=0,
            odometerUnit="mi",
            currentBid=bid,
            currency="GBP",
            location=str(row.get("location") or "UK"),
            auctionDate=(datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            imageUrl=img,
            imageUrls=[img],
            transmission="—",
            fuel="—",
            drive="—",
            exteriorColor="—",
            hasKeys=False,
            runsDrives=False,
            category=cat_m.group(1).upper() if cat_m else None,
            lotUrl=str(row.get("url") or f"https://www.copart.co.uk/lot/{ln}"),
        )

    make = title_case(str(row.get("mkn") or "Unknown"))
    model = title_case(str(row.get("lmg") or row.get("lm") or "Unknown"))
    year = int(row.get("lcy") or 2018)
    img = copart_image(str(row.get("tims") or ""))
    if not img:
        return None

    dyn = row.get("dynamicLotDetails") or {}
    bid = float(dyn.get("currentBid") or row.get("hb") or 0)
    buy_now = float(row.get("bnp") or dyn.get("buyTodayBid") or 0) or None
    odo = int(row.get("orr") or 0)
    damage = title_case(str(row.get("dd") or "Unknown")) or "Unknown"
    location = str(row.get("yn") or "UK")
    vin = str(row.get("fv") or "*****************")
    title_desc = str(row.get("td") or row.get("tgd") or row.get("ft") or "Salvage")
    cat = None
    cat_m = re.search(r"\bCat(?:egory)?\s*([ABNSCDXU])\b", title_desc, re.I)
    if cat_m:
        cat = cat_m.group(1).upper()
    else:
        m = re.search(r"\b([ABNSCDXU])\b", title_desc)
        if m:
            cat = m.group(1).upper()

    return AuctionLot(
        id=f"uk-copart-{ln}",
        slug=f"copart-uk-{year}-{slugify(make)}-{slugify(model)}-{ln}",
        region="uk",
        source="copart_uk",
        lotNumber=ln,
        vin=vin,
        make=make,
        model=model,
        year=year,
        titleType=_infer_title_type(title_desc),  # type: ignore[arg-type]
        titleLabel=(f"Category {cat}" if cat else title_desc[:80]) or "Salvage",
        primaryDamage=damage,
        secondaryDamage=title_case(str(row.get("sdd") or "")) or None,
        odometer=odo,
        odometerUnit="mi",
        currentBid=bid,
        buyNowPrice=buy_now,
        currency="GBP",
        location=location,
        auctionDate=ms_to_iso(row.get("ad") or row.get("lad")),
        imageUrl=img,
        imageUrls=[img],
        transmission=_copart_transmission(row),
        fuel=_copart_fuel(row),
        drive=_copart_drive(row),
        exteriorColor=title_case(str(row.get("clr") or "")) or "—",
        hasKeys=_copart_has_keys(row),
        runsDrives=_copart_runs_drives(row),
        engine=str(row.get("egn") or "").strip() or None,
        bodyStyle=title_case(str(row.get("bsd") or "")) or None,
        category=cat,
        lotUrl=f"https://www.copart.co.uk/lot/{ln}",
    )


def map_iaai_row(row: dict[str, Any]) -> AuctionLot | None:
    raw_id = str(row.get("id") or "")
    lot_number = raw_id.split("~")[0].strip()
    url = str(row.get("url") or "")
    image = str(row.get("image") or "")
    title = str(row.get("title") or "").strip()
    text = str(row.get("text") or "")
    if not lot_number or not image:
        return None
    if not title:
        m = re.search(r"\b((?:19|20)\d{2}\s+[A-Z0-9][^|]{2,60})", text)
        title = m.group(1).strip() if m else f"Lot {lot_number}"

    year, make, model = parse_title_year_make_model(title)
    fields = parse_iaai_text_fields(text)
    slug = f"iaai-{year}-{slugify(make)}-{slugify(model)}-{lot_number}"

    return AuctionLot(
        id=f"usa-iaai-{lot_number}",
        slug=slug,
        region="usa",
        source="iaai",
        lotNumber=lot_number,
        vin=str(fields.get("vin") or "*****************"),
        make=make,
        model=model,
        year=year,
        titleType="salvage",
        titleLabel="Salvage Certificate",
        primaryDamage=title_case(str(fields.get("damage") or "Unknown")) or "Unknown",
        odometer=int(fields.get("odometer") or 0),
        odometerUnit="mi",
        currentBid=float(fields.get("bid") or 0),
        currency="USD",
        location=str(fields.get("location") or "USA"),
        auctionDate=(datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
        imageUrl=image,
        imageUrls=[image],
        transmission="—",
        fuel="—",
        drive="—",
        exteriorColor="—",
        hasKeys=bool(fields.get("has_keys")),
        runsDrives=bool(fields.get("runs")),
        lotUrl=url or f"https://www.iaai.com/VehicleDetail/{raw_id}",
    )


def map_manheim_row(row: dict[str, Any]) -> AuctionLot | None:
    lid = str(row.get("id") or row.get("unifiedId") or "").strip()
    title = str(row.get("title") or "").strip()
    year = int(row.get("year") or 0)
    make = title_case(str(row.get("make") or ""))
    model = title_case(str(row.get("model") or row.get("trim") or ""))

    if not year or not make:
        if title:
            year, make, model = parse_title_year_make_model(title)
        else:
            return None
    if not lid:
        lid = f"{year}-{slugify(make)}-{slugify(model)}"

    images: list[str] = []
    for key in ("imageUrl", "thumbnailUrl", "image"):
        u = str(row.get(key) or "").strip()
        if u.startswith("http"):
            images.append(u)
    for item in row.get("images") or []:
        if isinstance(item, str) and item.startswith("http"):
            images.append(item)
        elif isinstance(item, dict):
            u = str(item.get("url") or item.get("href") or "")
            if u.startswith("http"):
                images.append(u)
    images = list(dict.fromkeys(images))
    if not images:
        return None

    bid = float(
        row.get("highBid")
        or row.get("startingBidPrice")
        or row.get("askingPrice")
        or row.get("buyNowPrice")
        or 0
    )
    buy_now = float(row.get("buyNowPrice") or 0) or None
    loc = row.get("facilitationLocation") or row.get("location") or "USA"
    if isinstance(loc, dict):
        loc = loc.get("name") or loc.get("city") or "USA"
    auction = str(row.get("auctionStartTime") or row.get("auctionEndTime") or row.get("firstTimeListed") or "")
    if not auction:
        auction = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()

    url = str(row.get("vdpUrl") or row.get("detailUrl") or row.get("href") or row.get("url") or "")
    vin = str(row.get("vin") or "*****************")
    odo = int(row.get("odometer") or 0)

    return AuctionLot(
        id=f"usa-manheim-{lid}",
        slug=f"manheim-{year}-{slugify(make)}-{slugify(model)}-{slugify(lid)[:20]}",
        region="usa",
        source="manheim",
        lotNumber=lid[:40],
        vin=vin,
        make=make,
        model=model or "Unknown",
        year=year,
        titleType="clean",
        titleLabel=str(row.get("titleType") or row.get("titleState") or "Manheim"),
        primaryDamage=title_case(str(row.get("frameDamage") or "Unknown")) or "Unknown",
        odometer=odo,
        odometerUnit="mi",
        currentBid=bid,
        buyNowPrice=buy_now,
        currency="USD",
        location=str(loc),
        auctionDate=auction if "T" in auction else f"{auction}T12:00:00+00:00",
        imageUrl=images[0],
        imageUrls=images[:12],
        transmission=str(row.get("transmission") or "—"),
        fuel=str(row.get("fuelType") or "—"),
        drive=str(row.get("driveTrain") or "—"),
        exteriorColor=title_case(str(row.get("exteriorColor") or "")) or "—",
        hasKeys=bool(row.get("hasKeys")),
        runsDrives=False,
        engine=str(row.get("engineDescription") or "") or None,
        bodyStyle=title_case(str(row.get("bodyStyle") or "")) or None,
        lotUrl=url or None,
    )


def map_salvage_market_row(row: dict[str, Any]) -> AuctionLot | None:
    lid = str(row.get("id") or "").strip()
    title = str(row.get("title") or "").strip()
    image = str(row.get("image") or "").strip()
    if not image:
        return None
    year, make, model = parse_title_year_make_model(title or f"Lot {lid}")
    if not lid:
        lid = f"{year}-{slugify(make)}-{slugify(model)}"

    text = str(row.get("text") or "")
    bid_m = re.search(r"£\s*([\d,]+(?:\.\d+)?)", text)
    bid = float(bid_m.group(1).replace(",", "")) if bid_m else float(row.get("bid") or 0)
    odo_m = re.search(r"([\d,]+)\s*(?:mi|miles)\b", text, re.I)
    odo = int(odo_m.group(1).replace(",", "")) if odo_m else int(row.get("odometer") or 0)
    cat_m = re.search(r"\bCat(?:egory)?\s*([ABNSCDXU])\b", text, re.I)

    return AuctionLot(
        id=f"uk-salvage-{lid}",
        slug=f"salvage-market-{year}-{slugify(make)}-{slugify(model)}-{slugify(lid)[:16]}",
        region="uk",
        source="salvage_market",
        lotNumber=lid[:40],
        vin="*****************",
        make=make,
        model=model,
        year=year,
        titleType="salvage",
        titleLabel=f"Category {cat_m.group(1).upper()}" if cat_m else "Salvage Market",
        primaryDamage=title_case(str(row.get("damage") or "Unknown")) or "Unknown",
        odometer=odo,
        odometerUnit="mi",
        currentBid=bid,
        currency="GBP",
        location=str(row.get("location") or "UK"),
        auctionDate=str(row.get("auctionDate") or (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()),
        imageUrl=image,
        imageUrls=[image],
        transmission="—",
        fuel="—",
        drive="—",
        exteriorColor="—",
        hasKeys=False,
        runsDrives=False,
        category=cat_m.group(1).upper() if cat_m else None,
        lotUrl=str(row.get("url") or None),
    )


# Korean manufacturer → English catalog name
ENCAR_MAKE_EN: dict[str, str] = {
    "현대": "Hyundai",
    "기아": "Kia",
    "제네시스": "Genesis",
    "쉐보레": "Chevrolet",
    "르노코리아": "Renault Korea",
    "르노삼성": "Renault Korea",
    "쌍용": "KG Mobility",
    "케이지모빌리티": "KG Mobility",
    "KG모빌리티": "KG Mobility",
    "삼성": "Renault Korea",
    "BMW": "BMW",
    "벤츠": "Mercedes-Benz",
    "메르세데스벤츠": "Mercedes-Benz",
    "아우디": "Audi",
    "폭스바겐": "Volkswagen",
    "볼보": "Volvo",
    "미니": "MINI",
    "포르쉐": "Porsche",
    "렉서스": "Lexus",
    "토요타": "Toyota",
    "도요타": "Toyota",
    "혼다": "Honda",
    "닛산": "Nissan",
    "인피니티": "Infiniti",
    "재규어": "Jaguar",
    "랜드로버": "Land Rover",
    "지프": "Jeep",
    "포드": "Ford",
    "링컨": "Lincoln",
    "캐딜락": "Cadillac",
    "테슬라": "Tesla",
    "페라리": "Ferrari",
    "람보르기니": "Lamborghini",
    "벤틀리": "Bentley",
    "롤스로이스": "Rolls-Royce",
    "마세라티": "Maserati",
    "폴스타": "Polestar",
    "BYD": "BYD",
}


ENCAR_FUEL_EN: dict[str, str] = {
    "가솔린": "Gasoline",
    "휘발유": "Gasoline",
    "디젤": "Diesel",
    "LPG": "Gas",
    "LPG(일반인 구입)": "Gas",
    "전기": "Electric",
    "하이브리드": "Hybrid",
    "가솔린+전기": "Hybrid",
    "디젤+전기": "Hybrid",
    "수소": "Hydrogen",
}


ENCAR_MODEL_EN: dict[str, str] = {
    "그랜저": "Grandeur",
    "쏘렌토": "Sorento",
    "투싼": "Tucson",
    "싼타페": "Santa Fe",
    "아반떼": "Avante",
    "쏘나타": "Sonata",
    "팰리세이드": "Palisade",
    "카니발": "Carnival",
    "스포티지": "Sportage",
    "셀토스": "Seltos",
    "모닝": "Morning",
    "레이": "Ray",
    "니로": "Niro",
    "아이오닉": "Ioniq",
    "아이오닉 5": "Ioniq 5",
    "아이오닉 6": "Ioniq 6",
    "G70": "G70",
    "G80": "G80",
    "G90": "G90",
    "GV70": "GV70",
    "GV80": "GV80",
    "K3": "K3",
    "K5": "K5",
    "K8": "K8",
    "K9": "K9",
}


ENCAR_TRANS_EN: dict[str, str] = {
    "오토": "Automatic",
    "자동": "Automatic",
    "수동": "Manual",
    "CVT": "CVT",
    "세미오토": "Automatic",
}


def _encar_make(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return "Unknown"
    return ENCAR_MAKE_EN.get(text) or ENCAR_MAKE_EN.get(text.replace(" ", "")) or title_case(text)


def _encar_photo(row: dict[str, Any]) -> list[str]:
    photos: list[str] = []
    for key in ("Photos", "photos", "Photo", "photo", "Image", "image"):
        val = row.get(key)
        if isinstance(val, list):
            for item in val:
                if isinstance(item, str) and item.strip():
                    photos.append(item.strip())
                elif isinstance(item, dict):
                    u = item.get("location") or item.get("url") or item.get("path")
                    if u:
                        photos.append(str(u))
        elif isinstance(val, str) and val.strip():
            photos.append(val.strip())
    # Encar often stores relative paths like /carpicture05/...
    out: list[str] = []
    for p in photos:
        if p.startswith("http"):
            out.append(p)
        elif p.startswith("//"):
            out.append("https:" + p)
        elif p.startswith("/"):
            out.append("https://ci.encar.com" + p)
        else:
            out.append("https://ci.encar.com/carpicture" + ("" if p.startswith("0") else "/") + p)
    # Dedup preserve order
    seen: set[str] = set()
    uniq: list[str] = []
    for u in out:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    return uniq


def _encar_year(row: dict[str, Any]) -> int:
    raw = row.get("Year") or row.get("year") or row.get("FormYear") or 0
    text = str(raw).strip()
    # Sometimes "20/05" or 202005
    m = re.search(r"(20\d{2})", text)
    if m:
        return int(m.group(1))
    try:
        n = int(float(text))
        if n > 1900:
            return n
        if n > 100000:  # YYYYMM
            return n // 100
    except (TypeError, ValueError):
        pass
    return 2018


def map_encar_row(row: dict[str, Any]) -> AuctionLot | None:
    """Map Encar SearchResults row → AuctionLot (region=korea)."""
    lid = str(row.get("Id") or row.get("id") or "").strip()
    if not lid:
        return None

    images = _encar_photo(row)
    if not images:
        # Encar CDN convention: first image by car id
        images = [f"https://ci.encar.com/carpicture{int(lid) % 10:02d}/pic{lid}_001.jpg"]

    make = _encar_make(str(row.get("Manufacturer") or row.get("manufacturer") or ""))
    model_raw = str(row.get("Model") or row.get("model") or row.get("Badge") or row.get("badge") or "Unknown")
    model = ENCAR_MODEL_EN.get(model_raw) or (
        title_case(model_raw) if re.match(r"^[A-Za-z0-9]", model_raw) else title_case(model_raw)
    )
    badge = str(row.get("Badge") or row.get("badge") or "").strip()
    if badge and (not model or model in {"Unknown", ""} or re.search(r"[\uac00-\ud7a3]", model)):
        model = ENCAR_MODEL_EN.get(badge) or title_case(badge)

    year = _encar_year(row)
    # Price on Encar list API is typically 만원 (10,000 KRW)
    price_manwon = float(row.get("Price") or row.get("price") or 0)
    price_krw = price_manwon * 10_000 if price_manwon < 100_000 else price_manwon
    # Store USD approx for existing UI; keep KRW as estimatedRetail
    usd = round(price_krw / 1350) if price_krw else 0

    fuel_raw = str(row.get("FuelType") or row.get("fuelType") or row.get("Fuel") or "")
    trans_raw = str(row.get("Transmission") or row.get("transmission") or "")
    fuel = ENCAR_FUEL_EN.get(fuel_raw) or ENCAR_FUEL_EN.get(fuel_raw.replace(" ", "")) or _clean_spec(fuel_raw)
    trans = ENCAR_TRANS_EN.get(trans_raw) or ENCAR_TRANS_EN.get(trans_raw.replace(" ", "")) or _clean_spec(trans_raw)

    city = str(
        row.get("OfficeCityState")
        or row.get("officeCityState")
        or row.get("Location")
        or row.get("region")
        or "Korea"
    ).strip()

    mileage = int(float(row.get("Mileage") or row.get("mileage") or 0))
    separation = str(row.get("Separation") or "").upper()  # A=domestic etc.

    lot_url = f"https://www.encar.com/dc/dc_cardetailview.do?carid={lid}"
    if separation:
        lot_url = f"https://fem.encar.com/cars/detail/{lid}"

    return AuctionLot(
        id=f"korea-{lid}",
        slug=f"encar-{year}-{slugify(make)}-{slugify(model)}-{lid}",
        region="korea",
        source="encar",
        lotNumber=lid,
        vin=str(row.get("Vin") or row.get("vin") or "*****************")[:17],
        make=make,
        model=model,
        year=year,
        titleType="clean",
        titleLabel="Encar (Korea)",
        primaryDamage="—",
        odometer=mileage,
        odometerUnit="km",
        currentBid=float(usd),
        buyNowPrice=float(usd) if usd else None,
        currency="USD",
        location=city or "Korea",
        auctionDate=(datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
        imageUrl=images[0],
        imageUrls=images[:12],
        transmission=trans,
        fuel=fuel,
        drive="—",
        exteriorColor=title_case(str(row.get("Color") or row.get("color") or "")) or "—",
        hasKeys=True,
        runsDrives=True,
        estimatedRetail=float(price_krw) if price_krw else None,
        engine=str(row.get("Displacement") or row.get("displacement") or "") or None,
        bodyStyle=title_case(str(row.get("BodyName") or row.get("bodyName") or "")) or None,
        lotUrl=lot_url,
    )


def china_lot_url(row: dict[str, Any], lot_number: str) -> str:
    """Prefer scraped detail URL; otherwise Che168 dealer/detail fallback by id."""
    for key in ("lotUrl", "url", "detailUrl", "href", "link", "pcUrl", "mUrl"):
        u = str(row.get(key) or "").strip()
        if u.startswith("http"):
            return u
    return f"https://www.che168.com/dealer/{lot_number}.html"


def map_china_market_row(row: dict[str, Any]) -> AuctionLot | None:
    """China used-car / export marketplace row → AuctionLot (always with lotUrl)."""
    lid = str(
        row.get("id")
        or row.get("lotNumber")
        or row.get("InfoId")
        or row.get("carId")
        or row.get("CarId")
        or ""
    ).strip()
    title = str(row.get("title") or row.get("Title") or "").strip()
    year = int(row.get("year") or row.get("Year") or 0)
    make = title_case(str(row.get("make") or row.get("Make") or row.get("brand") or ""))
    model = title_case(str(row.get("model") or row.get("Model") or row.get("series") or ""))

    if not year or not make:
        if title:
            year, make, model = parse_title_year_make_model(title)
        else:
            return None
    if not lid:
        lid = f"{year}-{slugify(make)}-{slugify(model)}"

    images: list[str] = []
    for key in ("imageUrl", "image", "ImageUrl", "pic", "Pic"):
        u = str(row.get(key) or "").strip()
        if u.startswith("http"):
            images.append(u)
    for item in row.get("images") or row.get("imageUrls") or []:
        if isinstance(item, str) and item.startswith("http"):
            images.append(item)
        elif isinstance(item, dict):
            u = str(item.get("url") or item.get("src") or "")
            if u.startswith("http"):
                images.append(u)
    images = list(dict.fromkeys(images))
    if not images:
        return None

    price = float(
        row.get("currentBid")
        or row.get("price")
        or row.get("Price")
        or row.get("priceUsd")
        or 0
    )
    odo = int(row.get("odometer") or row.get("mileage") or row.get("Mileage") or 0)
    lot_url = china_lot_url(row, lid)

    return AuctionLot(
        id=f"china-{lid}",
        slug=f"china-market-{year}-{slugify(make)}-{slugify(model)}-{slugify(lid)[:20]}",
        region="china",
        source="china_market",
        lotNumber=lid[:40],
        vin=str(row.get("vin") or row.get("Vin") or "*****************")[:17],
        make=make,
        model=model or "Unknown",
        year=year,
        titleType="clean",
        titleLabel=str(row.get("titleLabel") or "China market"),
        primaryDamage=title_case(str(row.get("primaryDamage") or row.get("damage") or "—")) or "—",
        odometer=odo,
        odometerUnit="km",
        currentBid=price,
        buyNowPrice=float(row.get("buyNowPrice") or 0) or (price or None),
        currency="USD",
        location=str(row.get("location") or row.get("city") or "China"),
        auctionDate=str(
            row.get("auctionDate")
            or (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        ),
        imageUrl=images[0],
        imageUrls=images[:12],
        transmission=_clean_spec(row.get("transmission") or row.get("Transmission")),
        fuel=_clean_spec(row.get("fuel") or row.get("Fuel") or row.get("fuelType")),
        drive=_clean_spec(row.get("drive") or row.get("Drive")),
        exteriorColor=title_case(str(row.get("exteriorColor") or row.get("color") or "")) or "—",
        hasKeys=bool(row.get("hasKeys", True)),
        runsDrives=bool(row.get("runsDrives", True)),
        engine=str(row.get("engine") or "") or None,
        bodyStyle=normalize_body_style(row.get("bodyStyle") or row.get("body_style") or row.get("BodyName")),
        lotUrl=lot_url,
    )
