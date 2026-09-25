from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.lots import AuctionLot, CatalogTab


@dataclass
class LotFilters:
    q: str | None = None
    make: str | None = None
    model: str | None = None
    year_from: int | None = None
    year_to: int | None = None
    auctions: list[str] | None = None
    price_min: float | None = None
    price_max: float | None = None
    body: str | None = None
    damage: str | None = None
    drive: str | None = None
    trans: str | None = None
    fuel: str | None = None
    mileage_max: int | None = None
    eng_min: float | None = None
    eng_max: float | None = None
    run: bool = False
    buynow: bool = False
    tab: CatalogTab = "all"
    region: str | None = None


def _includes(hay: str | None, needle: str) -> bool:
    if not hay:
        return False
    return needle.strip().lower() in hay.lower()


def _odometer_miles(lot: AuctionLot) -> int:
    if lot.odometerUnit == "km":
        return round(lot.odometer / 1.60934)
    return lot.odometer


def _engine_liters(lot: AuctionLot) -> float | None:
    hay = " ".join(filter(None, [lot.engine, lot.bodyStyle, lot.model]))
    m = re.search(r"(\d(?:[.,]\d)?)\s*l\b", hay, re.I) or re.search(
        r"\b(\d(?:[.,]\d)?)\s*л\b", hay, re.I
    )
    if m:
        return float(m.group(1).replace(",", "."))
    cc = re.search(r"(\d{3,4})\s*cc\b", hay, re.I)
    if cc:
        return round(int(cc.group(1)) / 1000, 1)
    return None


def _matches_tab(lot: AuctionLot, tab: CatalogTab) -> bool:
    if tab == "all":
        return True
    if tab == "buy-now":
        return lot.buyNowPrice is not None and lot.buyNowPrice > 0
    if tab == "passable":
        return lot.runsDrives
    if tab == "open":
        return lot.titleType == "clean"
    return True


def filter_lots(lots: list[AuctionLot], f: LotFilters) -> list[AuctionLot]:
    out: list[AuctionLot] = []
    for lot in lots:
        if f.region and lot.region != f.region:
            continue
        if f.q:
            hay = f"{lot.make} {lot.model} {lot.vin} {lot.lotNumber} {lot.year}".lower()
            if f.q.strip().lower() not in hay:
                continue
        if f.make and lot.make.strip().lower() != f.make.strip().lower():
            continue
        if f.model and not _includes(lot.model, f.model):
            continue
        if f.auctions and lot.source not in f.auctions:
            continue
        if not _matches_tab(lot, f.tab):
            continue
        if f.year_from is not None and lot.year < f.year_from:
            continue
        if f.year_to is not None and lot.year > f.year_to:
            continue
        if f.price_min is not None and lot.currentBid < f.price_min:
            continue
        if f.price_max is not None and lot.currentBid > f.price_max:
            continue
        if f.mileage_max is not None and _odometer_miles(lot) > f.mileage_max:
            continue
        if f.body and not (
            _includes(lot.bodyStyle, f.body) or _includes(lot.model, f.body)
        ):
            continue
        if f.damage and not (
            _includes(lot.primaryDamage, f.damage) or _includes(lot.secondaryDamage, f.damage)
        ):
            continue
        if f.run and not lot.runsDrives:
            continue
        if f.buynow and not (lot.buyNowPrice and lot.buyNowPrice > 0):
            continue
        if f.eng_min is not None or f.eng_max is not None:
            liters = _engine_liters(lot)
            if liters is None:
                continue
            if f.eng_min is not None and liters < f.eng_min:
                continue
            if f.eng_max is not None and liters > f.eng_max:
                continue
        if f.fuel:
            want = f.fuel.strip().lower()
            hay = (lot.fuel or "").lower()
            if not hay or hay == "—":
                continue
            if want not in hay and want != hay:
                continue
        if f.drive:
            want = f.drive.strip().lower()
            hay = (lot.drive or "").lower()
            if not hay or hay == "—" or want not in hay:
                continue
        if f.trans:
            want = f.trans.strip().lower()
            hay = (lot.transmission or "").lower()
            if not hay or hay == "—" or want not in hay:
                continue
        out.append(lot)
    return out


def unique_sorted(values: list[str | None]) -> list[str]:
    return sorted({(v or "").strip() for v in values if (v or "").strip()}, key=str.lower)
