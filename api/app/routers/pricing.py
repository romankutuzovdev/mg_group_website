from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.data import static_content as sc
from app.data.store import lot_store
from app.models.leads import QuoteRequest, WeightPriceRequest
from app.models.lots import AuctionLot
from app.services.customs_by import calculate_customs_by
from app.services.lot_lookup import fetch_lot_from_url
from app.services.pricing import price_by_weight, quote_copart_uk, quote_iaai_usa

router = APIRouter(prefix="/pricing", tags=["pricing"])


class LotFromUrlRequest(BaseModel):
    url: str = Field(..., min_length=12, max_length=2000)


class CustomsByRequest(BaseModel):
    price_usd: float | None = None
    price_eur: float | None = None
    engine_cc: int | None = None
    year: int | None = None
    age_band: str | None = None
    engine_type: str | None = None
    fuel: str | None = None
    engine: str | None = None
    title: str | None = None
    person: Literal["individual", "company"] = "individual"
    benefit_50: bool = False
    include_epts: bool = True


@router.post("/customs-by")
def customs_by(body: CustomsByRequest) -> dict[str, Any]:
    """Растаможка РБ — те же формулы, что в боте MG.GROUP."""
    if (body.price_usd is None or body.price_usd <= 0) and (
        body.price_eur is None or body.price_eur <= 0
    ):
        raise HTTPException(status_code=422, detail="price_usd or price_eur required")
    return calculate_customs_by(
        price_usd=body.price_usd,
        price_eur=body.price_eur,
        engine_cc=body.engine_cc,
        year=body.year,
        age_band=body.age_band,
        engine_type=body.engine_type,
        fuel=body.fuel,
        engine=body.engine,
        title=body.title,
        person=body.person,
        benefit_50=body.benefit_50,
        include_epts=body.include_epts,
    )


@router.get("/commercial")
def commercial_tariffs() -> dict:
    return {
        "updated": sc.COMMERCIAL_UPDATED,
        "formula": sc.PRICING_FORMULA,
        "terms": sc.COMMERCIAL_TERMS,
        "weight_formula": sc.WEIGHT_FORMULA,
        "dismantle_tariffs": sc.DISMANTLE_TARIFFS,
        "extra_services": sc.EXTRA_SERVICES,
        "usa_inland_delivery": sc.USA_INLAND_DELIVERY,
        "usa_dispatching_usd": sc.USA_DISPATCHING_USD,
    }


@router.post("/weight")
def calc_weight(body: WeightPriceRequest) -> dict:
    return {
        "origin": body.origin,
        "kg": body.kg,
        "price_usd": price_by_weight(body.origin, body.kg),
        "formula": sc.WEIGHT_FORMULA[body.origin],
    }


@router.post("/lot-from-url")
async def lot_from_url(body: LotFromUrlRequest) -> dict:
    """Open lot URL in Chrome (CDP) and return fields for the calculator.

    Chrome must run headed via ``mg-chrome-cdp`` / scheduled task (Autologon).
    """
    try:
        return await fetch_lot_from_url(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось открыть лот в Chrome: {exc}",
        ) from exc


@router.post("/quote")
def calc_quote(body: QuoteRequest) -> dict:
    settings = get_settings()
    if body.region == "uk":
        fx = body.fx_rate if body.fx_rate and body.fx_rate > 0 else settings.default_fx_gbp_usd
        quote = quote_copart_uk(
            bid=body.bid,
            location=body.location,
            category=body.category,
            title=body.title,
            body_style=body.body_style,
            vat_on_sale=body.vat_on_sale,
            dismantle_type=body.dismantle_type,
            dismantle_kg=body.dismantle_kg,
            fx_rate=fx,
        )
        return {"region": "uk", "quote": quote}
    quote = quote_iaai_usa(
        bid=body.bid,
        title=body.title,
        body_style=body.body_style,
        dismantle_type=body.dismantle_type,
        dismantle_kg=body.dismantle_kg,
        bid_method=body.bid_method,
        volume=body.volume,
        location=body.location,
        inland_usd=body.inland_usd,
        inland_miles=body.inland_miles,
        include_america_delivery=body.include_america_delivery,
    )
    return {"region": "usa", "quote": quote}


@router.get("/quote/lot/{slug}")
def quote_lot(slug: str) -> dict:
    lot = lot_store.get_by_slug(slug) or lot_store.get_by_id(slug)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return _quote_for_lot(lot)


def _quote_for_lot(lot: AuctionLot) -> dict:
    settings = get_settings()
    title = f"{lot.year} {lot.make} {lot.model}"
    if lot.region == "uk":
        bid = lot.currentBid if lot.currency == "GBP" else lot.currentBid * 0.79
        quote = quote_copart_uk(
            bid=bid,
            location=lot.location,
            category=lot.category,
            title=title,
            body_style=lot.bodyStyle or lot.model,
            vat_on_sale=lot.vatOnSale,
            dismantle_kg=lot.weightKg,
            fx_rate=settings.default_fx_gbp_usd,
        )
        return {"region": "uk", "lot_id": lot.id, "slug": lot.slug, "quote": quote}

    quote = quote_iaai_usa(
        bid=lot.currentBid,
        title=title,
        body_style=lot.bodyStyle or lot.model,
        location=lot.location,
        inland_miles=lot.inlandMiles or 450,
        dismantle_kg=lot.weightKg,
        volume="standard",
        include_america_delivery=True,
    )
    return {"region": "usa", "lot_id": lot.id, "slug": lot.slug, "quote": quote}
