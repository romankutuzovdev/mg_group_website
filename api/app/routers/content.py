from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.data import static_content as sc
from app.data.store import leads_inbox, lot_store
from app.models.lots import AuctionLot
from app.models.leads import LeadCreate, LeadResponse
from app.services import showcase_picks
from app.services.pricing import quote_copart_uk, quote_iaai_usa
from app.config import get_settings

router = APIRouter(tags=["content"])


@router.get("/company")
def company() -> dict:
    return {
        "company": sc.COMPANY,
        "phones": sc.PHONES,
        "hero": sc.HERO,
        "benefits": sc.BENEFITS,
        "parts": sc.PARTS,
        "car_finder": sc.CAR_FINDER,
    }


@router.get("/team")
def team() -> list[dict]:
    return sc.TEAM


@router.get("/cities")
def cities() -> list[dict]:
    return sc.CITIES


@router.get("/cities/{slug}")
def city(slug: str) -> dict:
    found = next((c for c in sc.CITIES if c["slug"] == slug), None)
    if not found:
        raise HTTPException(status_code=404, detail="City not found")
    return found


@router.get("/faq")
def faq(category: str | None = None) -> dict:
    items = sc.FAQ_ITEMS
    if category and category != "all":
        items = [i for i in items if i["category"] == category]
    return {"categories": sc.FAQ_CATEGORIES, "items": items}


@router.get("/kits/schemes")
def kit_schemes() -> list[dict]:
    return sc.KIT_SCHEMES


@router.get("/kits/yards")
def kit_yards() -> list[dict]:
    return sc.YARDS


@router.get("/kits/yards/{yard_id}")
def kit_yard(yard_id: str) -> dict:
    found = next((y for y in sc.YARDS if y["id"] == yard_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Yard not found")
    return found


@router.get("/popular-models")
def popular_models() -> list[dict]:
    return sc.POPULAR_MODELS


# Cars people actually order: the block used to show the priciest lots
# (Rolls-Royce, Bentley) and Korean won read as dollars.
_CASE_MAKES = (
    "toyota", "honda", "nissan", "mazda", "hyundai", "kia", "ford", "chevrolet",
    "volkswagen", "subaru", "skoda", "renault", "peugeot", "mitsubishi", "jeep",
    "dodge", "vauxhall", "seat",
)
_CASE_PRICE_USD = (3000.0, 15000.0)
_CASE_YEARS = (2014, 2024)
_GBP_USD = 1.29


def _clean_model(lot: AuctionLot) -> str:
    """'Nissan' + 'Nissan Rogue' → 'Rogue' (some scrapes repeat the make)."""
    model = (lot.model or "").strip()
    make = (lot.make or "").strip()
    if make and model.lower().startswith(make.lower() + " "):
        return model[len(make) + 1 :].strip()
    return model


def _case_price(lot: AuctionLot) -> float:
    """Expected sale price in the lot's currency.

    Early bids are far below it: a 2026 Camry at a $2000 opening bid is not a
    price anyone pays, so prefer the middle of the estimated range.
    """
    low, high = lot.estimatedCostMin, lot.estimatedCostMax
    if low and high:
        return (low + high) / 2
    return float(low or high or lot.currentBid or 0)


def pick_case_lots(lots: Iterable[AuctionLot], limit: int) -> list[AuctionLot]:
    """Mass-market USA / UK lots with a sane bid, one per make, then a second round."""
    fits: dict[str, list[AuctionLot]] = {}
    for lot in lots:
        if lot.region not in {"usa", "uk"} or lot.sold or not lot.imageUrl:
            continue
        make = (lot.make or "").lower()
        price = _case_price(lot) * (_GBP_USD if lot.currency == "GBP" else 1.0)
        if (
            make in _CASE_MAKES
            and _CASE_PRICE_USD[0] <= price <= _CASE_PRICE_USD[1]
            and _CASE_YEARS[0] <= lot.year <= _CASE_YEARS[1]
        ):
            fits.setdefault(make, []).append(lot)
    for group in fits.values():
        group.sort(key=lambda l: (-l.year, _case_price(l), l.id))
    picked: list[AuctionLot] = []
    order = [m for m in _CASE_MAKES if m in fits]
    for round_idx in range(3):
        for make in order:
            if round_idx < len(fits[make]) and len(picked) < limit:
                picked.append(fits[make][round_idx])
    return picked


@router.get("/cases")
def cases(limit: int = Query(12, ge=1, le=50)) -> dict:
    """Illustrative kit estimates for public catalog lots."""
    settings = get_settings()
    items = []
    # Only the makes and years pick_case_lots can use: never decode the whole catalog.
    marks = ", ".join("?" for _ in _CASE_MAKES)
    pool = lot_store.iter_where(
        f"region IN ('usa', 'uk') AND sold = 0 AND make_lc IN ({marks}) AND year BETWEEN ? AND ?",
        (*_CASE_MAKES, *_CASE_YEARS),
    )
    for lot in pick_case_lots(pool, limit * 2):
        title = f"{lot.year} {lot.make} {_clean_model(lot)}"
        if lot.region == "uk":
            price = _case_price(lot)
            bid = price if lot.currency == "GBP" else price * 0.79
            q = quote_copart_uk(
                bid=bid,
                location=lot.location,
                category=lot.category,
                title=title,
                body_style=lot.bodyStyle or lot.model,
                vat_on_sale=lot.vatOnSale,
                dismantle_kg=lot.weightKg,
                fx_rate=settings.default_fx_gbp_usd,
            )
            budget = q.get("grandUsd") or 0
            currency = "USD"
        else:
            q = quote_iaai_usa(
                bid=_case_price(lot),
                title=title,
                body_style=lot.bodyStyle or lot.model,
                location=lot.location,
                inland_miles=lot.inlandMiles or 450,
                dismantle_kg=lot.weightKg,
            )
            budget = q.get("grandUsd") or 0
            currency = "USD"
        if not budget:
            continue
        items.append(
            {
                "id": f"auction-{lot.id}",
                "title": f"{lot.make} {_clean_model(lot)} {lot.year}",
                "subtitle": f"Лот #{lot.lotNumber}",
                "image": lot.imageUrl,
                "region": "Англия" if lot.region == "uk" else "США",
                "source": lot.source,
                "budget": round(budget),
                "kind": "catalog_estimate",
                "market": None,
                "currency": currency,
                "days": None,
                "story": f"{lot.primaryDamage}. Пробег {lot.odometer} {lot.odometerUnit}.",
                "href": f"/auctions/{lot.slug}/",
            }
        )
        if len(items) >= limit:
            break
    return {"items": items, "count": len(items)}


@router.get("/purchased")
def purchased(limit: int = Query(12, ge=1, le=50)) -> dict:
    """Legacy public feed, backed by the same published purchases as the kits page."""
    cars = []
    for pick in showcase_picks.list_public(section="bought", kind="kit", limit=limit):
        breakdown = {line["label"]: line["amount"] for line in pick["breakdown"]}
        auction = breakdown.get("Лот и сборы аукциона", breakdown.get("Лот и сборы Copart UK"))
        delivery = breakdown.get("Доставка по США", breakdown.get("Доставка по Англии"))
        total = pick["total_usd"]
        cars.append({
            "id": str(pick["id"]),
            "year": pick["year"],
            "make": pick["make"],
            "model": pick["model"],
            "image": pick["image_url"],
            "source": pick["source"],
            "region": {"uk": "Англия", "usa": "США"}.get(pick["region"], pick["region"]),
            "damage": pick["damage"],
            "odometer": pick["odometer"],
            "auctionPrice": auction,
            "delivery": delivery,
            "dismantle": breakdown.get("Разбор и отправка"),
            "deliveryAndFees": round(total - auction, 2) if total is not None and auction is not None else None,
            "totalCost": total,
            "marketBy": None,
            "currency": "USD",
            "kind": "published_purchase",
            "href": f"/podborka/?id={pick['id']}",
        })
    return {"items": cars, "count": len(cars)}


@router.post("/leads", response_model=LeadResponse)
def create_lead(body: LeadCreate) -> LeadResponse:
    lead_id = str(uuid.uuid4())
    leads_inbox.append(
        {
            "id": lead_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            **body.model_dump(),
        }
    )
    return LeadResponse(id=lead_id)


@router.get("/leads")
def list_leads() -> dict:
    """Dev helper — list in-memory leads. Protect in production."""
    return {"items": leads_inbox, "count": len(leads_inbox)}
