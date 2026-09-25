"""Pricing engines ported from lib/pricing (Copart UK + IAAI USA)."""

from __future__ import annotations

import math
import re
from typing import Any

TRANSFER_FEE_RATE = 0.03

UK_DISMANTLE = {"sedan": 2200, "suv": 2450, "sprinter": 2350, "pickup": 2650}
USA_DISMANTLE = {"sedan": 4100, "suv": 4450, "frame_suv": 4850}
USA_ALIASES = {"sedan": "sedan", "sprinter": "sedan", "suv": "suv", "pickup": "frame_suv", "frame_suv": "frame_suv"}

DELIVERY_RATES: dict[str, dict[str, float]] = {
    "DEFAULT": {"sedan": 300, "jeep": 350, "bus": 500},
    "ROCHFORD": {"sedan": 130, "jeep": 160, "bus": 200},
    "COLCHESTER": {"sedan": 190, "jeep": 230, "bus": 285},
    "SANDY": {"sedan": 180, "jeep": 230, "bus": 330},
    "SANDWICH": {"sedan": 130, "jeep": 160, "bus": 200},
    "NEWBURY": {"sedan": 220, "jeep": 260, "bus": 330},
    "WISBECH": {"sedan": 230, "jeep": 280, "bus": 380},
    "CORBY": {"sedan": 230, "jeep": 280, "bus": 380},
    "WESTBURY": {"sedan": 320, "jeep": 380, "bus": 480},
    "BRISTOL": {"sedan": 300, "jeep": 350, "bus": 500},
    "WOLVERHAMPTON": {"sedan": 320, "jeep": 350, "bus": 500},
    "SANDTOFT": {"sedan": 370, "jeep": 420, "bus": 570},
    "CHESTER": {"sedan": 420, "jeep": 470, "bus": 600},
    "YORK": {"sedan": 410, "jeep": 460, "bus": 600},
    "PETERLEE": {"sedan": 470, "jeep": 570, "bus": 650},
    "WHITBURN": {"sedan": 910, "jeep": 1100, "bus": 1365},
    "EAST KILBRIDE": {"sedan": 880, "jeep": 1060, "bus": 1320},
    "GLOUCESTER": {"sedan": 300, "jeep": 350, "bus": 500},
}

BUYER_FEE_BANDS_UK = [
    (49.99, 5, 20),
    (99.99, 20, 65),
    (199.99, 45, 85),
    (299.99, 65, 105),
    (349.99, 75, 115),
    (399.99, 85, 125),
    (449.99, 95, 135),
    (499.99, 100, 140),
    (549.99, 105, 145),
    (599.99, 115, 150),
    (699.99, 125, 165),
    (799.99, 140, 180),
    (899.99, 155, 195),
    (999.99, 170, 210),
    (1199.99, 185, 225),
    (1299.99, 205, 245),
    (1399.99, 215, 255),
    (1499.99, 225, 265),
    (1599.99, 235, 275),
    (1699.99, 245, 285),
    (1799.99, 260, 300),
    (1999.99, 270, 310),
    (2399.99, 300, 340),
    (2499.99, 325, 365),
    (2999.99, 350, 390),
    (3499.99, 385, 425),
    (3999.99, 425, 465),
    (4499.99, 470, 510),
    (4999.99, 495, 535),
    (5999.99, 515, 555),
    (7499.99, 525, 565),
    (9999.99, 550, 590),
]

LIVE_BID_FEE_BANDS = [
    (99.99, 0),
    (499.99, 35),
    (999.99, 49),
    (1499.99, 69),
    (1999.99, 79),
    (3999.99, 89),
    (5999.99, 99),
    (7999.99, 105),
    (math.inf, 109),
]

IAAI_BUYER_FEE_BANDS = [
    (49.99, 0, 25),
    (99.99, 0, 45),
    (199.99, 25, 80),
    (299.99, 60, 130),
    (349.99, 85, 137),
    (399.99, 100, 145),
    (449.99, 125, 175),
    (499.99, 135, 185),
    (549.99, 145, 205),
    (599.99, 155, 210),
    (699.99, 170, 240),
    (799.99, 195, 270),
    (899.99, 215, 295),
    (999.99, 230, 320),
    (1199.99, 250, 375),
    (1299.99, 270, 395),
    (1399.99, 285, 410),
    (1499.99, 300, 430),
    (1599.99, 315, 445),
    (1699.99, 330, 465),
    (1799.99, 350, 485),
    (1999.99, 370, 510),
    (2399.99, 390, 535),
    (2499.99, 425, 570),
    (2999.99, 460, 610),
    (3499.99, 505, 655),
    (3999.99, 555, 705),
    (4499.99, 600, 725),
    (4999.99, 625, 750),
    (5499.99, 650, 775),
    (5999.99, 675, 800),
    (6499.99, 700, 825),
    (6999.99, 720, 845),
    (7499.99, 755, 880),
    (7999.99, 775, 900),
    (8499.99, 800, 925),
    (9999.99, 820, 945),
    (11499.99, 850, 1000),
    (11999.99, 860, 1000),
    (12499.99, 875, 1000),
    (14999.99, 890, 1000),
]

IAAI_VIRTUAL_BID_BANDS = [
    (99.99, 0, 0),
    (499.99, 50, 40),
    (999.99, 65, 55),
    (1499.99, 85, 75),
    (1999.99, 95, 85),
    (3999.99, 110, 100),
    (5999.99, 125, 110),
    (7999.99, 145, 125),
    (math.inf, 160, 140),
]

BODY_RULES = [
    ("motorcycle", "sedan", re.compile(r"\b(motor\s*cycles?|motorbikes?|scooters?|quads?|atvs?)\b", re.I)),
    ("pickup", "pickup", re.compile(r"\b(pick[\s-]?ups?|double\s*cabs?|crew\s*cabs?|пикап)\b", re.I)),
    (
        "van",
        "sprinter",
        re.compile(
            r"\b(sprinters?|minibuses?|vans?|buses?|микроавтобус|mpvs?)\b",
            re.I,
        ),
    ),
    (
        "suv",
        "suv",
        re.compile(r"\b(suvs?|crossovers?|jeeps?|внедорожник|4\s*[xх]\s*4s?)\b", re.I),
    ),
    ("car", "sedan", re.compile(r"\b(hatchbacks?|saloons?|sedans?|coupes?|седан)\b", re.I)),
]


def round2(value: Any) -> float:
    return round(float(value or 0) * 100) / 100


def classify_vehicle(hint: str) -> dict[str, Any]:
    blob = re.sub(r"\s+", " ", re.sub(r"[_/]+", " ", (hint or "").lower())).strip()
    for vehicle_type, dismantle_type, pattern in BODY_RULES:
        if pattern.search(blob):
            return {"vehicleType": vehicle_type, "dismantleType": dismantle_type, "matched": True}
    return {"vehicleType": "car", "dismantleType": "sedan", "matched": False}


def is_category_b(category: str | None, title: str = "") -> bool:
    raw = (category or "").strip().upper()
    if raw in {"B", "CAT B", "CATEGORY B", "CATB"}:
        return True
    return bool(re.search(r"\bCAT(?:EGORY)?\s*B\b", f"{category or ''} {title}", re.I))


def resolve_region(raw: str | None) -> str:
    name = (raw or "").strip().upper()
    if not name:
        return "DEFAULT"
    if name in DELIVERY_RATES:
        return name
    for key in DELIVERY_RATES:
        if key == "DEFAULT":
            continue
        if key in name or name in key:
            return key
    return "DEFAULT"


def get_delivery(region: str | None, dismantle_type: str, category_b: bool) -> dict[str, Any]:
    key = resolve_region(region)
    rates = DELIVERY_RATES.get(key, DELIVERY_RATES["DEFAULT"])
    if dismantle_type == "sprinter":
        base = "bus"
    elif dismantle_type in {"suv", "pickup"}:
        base = "jeep"
    else:
        base = "sedan"
    column = "jeep" if category_b and base == "sedan" else base
    return {
        "regionKey": key,
        "column": column,
        "amount": float(rates.get(column, rates["sedan"])),
        "label": {"sedan": "Седан", "jeep": "Джип", "bus": "Бус"}.get(column, column),
    }


def _buyer_fee_uk(price: float, tier: str = "A") -> float:
    if price >= 10000:
        return round2(price * (0.065 if tier == "B" else 0.055))
    for max_price, fee_a, fee_b in BUYER_FEE_BANDS_UK:
        if price <= max_price:
            return fee_b if tier == "B" else fee_a
    return BUYER_FEE_BANDS_UK[-1][1]


def _live_bid_fee(price: float) -> float:
    for max_price, fee in LIVE_BID_FEE_BANDS:
        if price <= max_price:
            return fee
    return 109


def quote_copart_uk(
    *,
    bid: float,
    location: str | None = None,
    category: str | None = None,
    title: str | None = None,
    body_style: str | None = None,
    vat_on_sale: bool | None = None,
    dismantle_type: str | None = None,
    dismantle_kg: float | None = None,
    fx_rate: float | None = None,
) -> dict[str, Any]:
    classified = classify_vehicle(" ".join(filter(None, [body_style, title])))
    dtype = (dismantle_type or "").strip().lower()
    if dtype in UK_DISMANTLE:
        classified = {"vehicleType": classified["vehicleType"], "dismantleType": dtype, "matched": True}

    category_b = is_category_b(category, title or "")
    vat = bool(category_b or vat_on_sale)
    sale = round2(bid)
    buyer_a = _buyer_fee_uk(sale, "A")
    live_bid = _live_bid_fee(sale)
    retrieval = 50
    fees_net = round2(buyer_a + live_bid + retrieval)
    vat_fees = round2(fees_net * 0.2)
    vat_sale = round2(sale * 0.2) if vat else 0
    copart_total = round2(sale + fees_net + vat_fees + vat_sale)

    delivery = get_delivery(location, classified["dismantleType"], category_b)
    subtotal = round2(copart_total + delivery["amount"])
    transfer_fee = round2(subtotal * TRANSFER_FEE_RATE)
    total_uk = round2(subtotal + transfer_fee)

    kg = dismantle_kg if dismantle_kg and dismantle_kg > 0 else None
    if kg:
        dismantle_usd = round2(800 + 1.6 * kg)
        dismantle_mode = "weight"
    else:
        dismantle_usd = UK_DISMANTLE.get(classified["dismantleType"], UK_DISMANTLE["sedan"])
        dismantle_mode = "tariff"

    result: dict[str, Any] = {
        "auction": "copart_uk",
        "copart": {
            "bid": sale,
            "buyerA": buyer_a,
            "liveBid": live_bid,
            "retrieval": retrieval,
            "feesNet": fees_net,
            "vatFees": vat_fees,
            "vatSale": vat_sale,
            "copartTotal": copart_total,
        },
        "delivery": delivery,
        "subtotal": subtotal,
        "transferFee": transfer_fee,
        "totalUk": total_uk,
        "dismantleUsd": dismantle_usd,
        "dismantleType": classified["dismantleType"],
        "dismantleMode": dismantle_mode,
        "dismantleKg": kg,
        "vehicleType": classified["vehicleType"],
        "categoryB": category_b,
        "fxRate": None,
        "englandUsd": None,
        "grandUsd": None,
    }
    if fx_rate and fx_rate > 0:
        england_usd = round2(total_uk * fx_rate)
        result["fxRate"] = fx_rate
        result["englandUsd"] = england_usd
        result["grandUsd"] = round2(england_usd + dismantle_usd)
    return result


def _iaai_buyer_fee(price: float, volume: str = "high") -> float:
    high = volume != "standard"
    if price >= 15000:
        return round2(price * (0.06 if high else 0.075))
    for max_price, fee_hv, fee_std in IAAI_BUYER_FEE_BANDS:
        if price <= max_price:
            return fee_hv if high else fee_std
    return round2(price * (0.06 if high else 0.075))


def _iaai_virtual(price: float, method: str = "live") -> float:
    for max_price, live_fee, proxy_fee in IAAI_VIRTUAL_BID_BANDS:
        if price <= max_price:
            return proxy_fee if method == "proxy" else live_fee
    return 140 if method == "proxy" else 160


def quote_iaai_usa(
    *,
    bid: float,
    title: str | None = None,
    body_style: str | None = None,
    dismantle_type: str | None = None,
    dismantle_kg: float | None = None,
    bid_method: str = "live",
    volume: str = "standard",
    location: str | None = None,
    inland_usd: float | None = None,
    inland_miles: float | None = None,
    include_america_delivery: bool = True,
) -> dict[str, Any]:
    classified = classify_vehicle(" ".join(filter(None, [body_style, title])))
    raw = (dismantle_type or classified["dismantleType"]).lower()
    dtype = USA_ALIASES.get(raw, "sedan")

    sale = round2(bid)
    is_high = volume == "high"
    buyer = _iaai_buyer_fee(sale, "high" if is_high else "standard")
    virtual = _iaai_virtual(sale, bid_method)
    service = 79 if is_high else 105
    environmental = 10 if is_high else 15
    title_fee = 20
    fixed = round2(service + environmental + title_fee)
    fees_net = round2(buyer + virtual + fixed)
    iaai_total = round2(sale + fees_net)

    kg = dismantle_kg if dismantle_kg and dismantle_kg > 0 else None
    if kg:
        dismantle_usd = round2(1300 + 2.2 * kg)
        dismantle_mode = "weight"
    else:
        dismantle_usd = USA_DISMANTLE.get(dtype, USA_DISMANTLE["sedan"])
        dismantle_mode = "tariff"

    america_subtotal = iaai_total
    delivery_usa = None
    if include_america_delivery:
        inland = (
            round2(inland_usd)
            if inland_usd is not None and inland_usd >= 0
            else round2(inland_miles if inland_miles is not None else 450)
        )
        america_subtotal = round2(iaai_total + inland)
        delivery_usa = {
            "location": location,
            "inlandMiles": inland_miles if inland_miles is not None else inland,
            "inlandUsd": inland,
        }

    dispatching = 200
    transfer_fee = round2(america_subtotal * TRANSFER_FEE_RATE)
    usa_with_fees = round2(america_subtotal + dispatching + transfer_fee)

    return {
        "auction": "iaai",
        "iaai": {
            "bid": sale,
            "buyerFee": buyer,
            "virtualBid": virtual,
            "serviceFee": service,
            "environmentalFee": environmental,
            "titleFee": title_fee,
            "feesNet": fees_net,
            "iaaiTotal": iaai_total,
            "volume": volume,
        },
        "deliveryUsa": delivery_usa,
        "subtotalUsa": america_subtotal,
        "dispatchingUsd": dispatching,
        "transferFee": transfer_fee,
        "usaWithFees": usa_with_fees,
        "dismantleUsd": dismantle_usd,
        "dismantleType": dtype,
        "dismantleMode": dismantle_mode,
        "dismantleKg": kg,
        "vehicleType": classified["vehicleType"],
        "grandUsd": round2(usa_with_fees + dismantle_usd),
    }


def price_by_weight(origin: str, kg: float) -> float:
    if origin == "uk":
        return round(800 + 1.6 * kg)
    return round(1300 + 2.2 * kg)
