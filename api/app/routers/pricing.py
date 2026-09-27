from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.data import static_content as sc
from app.data.store import lot_store
from app.models.leads import QuoteRequest, WeightPriceRequest
from app.models.lots import AuctionLot
from app.services.auth_deps import get_current_user, require_admin
from app.services.customs_by import calculate_customs_by
from app.services.lot_lookup import fetch_lot_from_url
from app.services.pricing import price_by_weight, quote_copart_uk, quote_iaai_usa
from app.services import quote_history
from app.services.telegram_notify import _escape, send_telegram_message
from app.services.cabinet_admin import parse_admin_ids

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
    """Resolve lot for calculator: production catalog first, then Chrome CDP."""
    try:
        return await fetch_lot_from_url(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось открыть лот (каталог + Chrome): {exc}",
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


class QuoteHistoryIn(BaseModel):
    kind: Literal["usa", "uk", "restoration", "customs"]
    title: str = ""
    lot_url: str = ""
    location: str = ""
    bid: float | None = None
    currency: Literal["USD", "GBP"] = "USD"
    total_usd: float | None = None
    summary: str = ""


_KIND_LABEL = {
    "usa": "Машинокомплект США",
    "uk": "Машинокомплект Англия",
    "restoration": "Авто под восстановление",
    "customs": "Растаможка",
}


def _quote_telegram_text(user: Any, row: dict[str, Any]) -> str:
    who = " ".join(p for p in (user.first_name, user.last_name) if p).strip() or "Пользователь"
    if user.username:
        who = f"{who} @{user.username}"
    lines = [
        f"<b>Просчёт · {_escape(_KIND_LABEL.get(row['kind'], row['kind']))}</b>",
        _escape(who),
        f"TG {user.telegram_id}",
    ]
    if row.get("title"):
        lines.append(_escape(str(row["title"])))
    if row.get("location"):
        lines.append(f"Площадка: {_escape(str(row['location']))}")
    if row.get("bid"):
        cur = "£" if row.get("currency") == "GBP" else "$"
        lines.append(f"Ставка: {cur}{int(round(float(row['bid']))):,}".replace(",", " "))
    if row.get("total_usd"):
        lines.append(f"Итого: ${int(round(float(row['total_usd']))):,}".replace(",", " "))
    if row.get("summary"):
        lines.append(_escape(str(row["summary"])))
    if row.get("lot_url"):
        lines.append(_escape(str(row["lot_url"])))
    return "\n".join(lines)


@router.post("/history")
async def save_quote_history(
    body: QuoteHistoryIn,
    user=Depends(get_current_user),
    settings=Depends(get_settings),
) -> dict[str, Any]:
    row = quote_history.add_quote(
        user_id=user.id,
        telegram_id=user.telegram_id,
        username=user.username or "",
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        kind=body.kind,
        title=body.title,
        lot_url=body.lot_url,
        location=body.location,
        bid=body.bid,
        currency=body.currency,
        total_usd=body.total_usd,
        summary=body.summary,
    )
    text = _quote_telegram_text(user, row)
    for chat_id in sorted(parse_admin_ids(settings.cabinet_admin_telegram_ids)):
        if chat_id == user.telegram_id:
            continue
        await send_telegram_message(chat_id, text)
    return row


@router.get("/history")
def my_quote_history(user=Depends(get_current_user)) -> list[dict[str, Any]]:
    return quote_history.list_for_user(user.id)


@router.get("/history/all")
def all_quote_history(_admin=Depends(require_admin)) -> list[dict[str, Any]]:
    return quote_history.list_all()
