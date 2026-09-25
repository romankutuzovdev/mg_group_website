from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.data import static_content as sc
from app.data.store import leads_inbox, lot_store
from app.models.leads import LeadCreate, LeadResponse
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


@router.get("/cases")
def cases(limit: int = Query(12, ge=1, le=50)) -> dict:
    """Example client cases derived from catalog lots + turnkey quote."""
    settings = get_settings()
    items = []
    seen_makes: set[str] = set()
    for lot in lot_store.all():
        if lot.make in seen_makes and len(items) >= 3:
            # diversify a bit
            if len(seen_makes) < 8 and lot.make in seen_makes:
                continue
        title = f"{lot.year} {lot.make} {lot.model}"
        if lot.region == "uk":
            bid = lot.currentBid if lot.currency == "GBP" else lot.currentBid * 0.79
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
                bid=lot.currentBid,
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
        market = round(budget * 1.28)
        items.append(
            {
                "id": f"auction-{lot.id}",
                "title": f"{lot.make} {lot.model} {lot.year}",
                "subtitle": f"Лот #{lot.lotNumber}",
                "image": lot.imageUrl,
                "region": "Англия" if lot.region == "uk" else "США",
                "source": lot.source,
                "budget": round(budget),
                "market": market,
                "currency": currency,
                "days": 40 if lot.region == "uk" else 50,
                "story": f"{lot.primaryDamage}. Пробег {lot.odometer} {lot.odometerUnit}.",
                "href": f"/auctions/{lot.slug}/",
            }
        )
        seen_makes.add(lot.make)
        if len(items) >= limit:
            break
    return {"items": items, "count": len(items)}


@router.get("/purchased")
def purchased(limit: int = Query(12, ge=1, le=50)) -> dict:
    """Purchased kits feed — same idea as site: lots with turnkey breakdown."""
    settings = get_settings()
    cars = []
    for lot in lot_store.all():
        title = f"{lot.year} {lot.make} {lot.model}"
        if lot.region == "uk":
            bid = lot.currentBid if lot.currency == "GBP" else lot.currentBid * 0.79
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
            amount = q.get("grandUsd") or 0
            dismantle = q.get("dismantleUsd") or 0
            delivery = (q.get("delivery") or {}).get("amount") or 0
            auction_total = (q.get("copart") or {}).get("copartTotal") or 0
            if q.get("englandUsd") and q.get("totalUk"):
                auction_total = round((auction_total / q["totalUk"]) * q["englandUsd"])
                delivery = round((delivery / q["totalUk"]) * q["englandUsd"])
        else:
            q = quote_iaai_usa(
                bid=lot.currentBid,
                title=title,
                body_style=lot.bodyStyle or lot.model,
                location=lot.location,
                inland_miles=lot.inlandMiles or 450,
                dismantle_kg=lot.weightKg,
            )
            amount = q.get("grandUsd") or 0
            dismantle = q.get("dismantleUsd") or 0
            delivery = (q.get("deliveryUsa") or {}).get("inlandUsd") or 0
            auction_total = (q.get("iaai") or {}).get("iaaiTotal") or 0
        if not amount:
            continue
        cars.append(
            {
                "id": f"auction-{lot.id}",
                "year": lot.year,
                "make": lot.make,
                "model": lot.model,
                "image": lot.imageUrl,
                "source": lot.source,
                "region": "Англия" if lot.region == "uk" else "США",
                "damage": lot.primaryDamage or "Salvage",
                "odometer": f"{lot.odometer} {lot.odometerUnit}",
                "auctionPrice": round(auction_total),
                "delivery": round(delivery),
                "dismantle": round(dismantle),
                "deliveryAndFees": max(0, round(amount - auction_total)),
                "totalCost": round(amount),
                "marketBy": round(amount * 1.28),
                "currency": "USD",
                "href": f"/auctions/{lot.slug}/",
            }
        )
        if len(cars) >= limit:
            break
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
