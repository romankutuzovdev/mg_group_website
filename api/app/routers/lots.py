from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.config import Settings, get_settings
from app.data.store import lot_store
from app.models.lots import (
    AuctionLot,
    LotBulkUpsertResponse,
    LotListResponse,
    LotMetaResponse,
)
from app.services.auction_date import active_lots, is_auction_ended
from app.services.filter_lots import LotFilters, filter_lots, unique_sorted

router = APIRouter(prefix="/lots", tags=["lots"])


def _require_ingest_key(
    settings: Annotated[Settings, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    expected = settings.ingest_api_key.strip()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


def _catalog_lots() -> list[AuctionLot]:
    """Lots still on auction (ended ones are hidden immediately, pruned by scrapers)."""
    settings = get_settings()
    grace = settings.scraper_auction_grace_hours if settings.scraper_prune_ended else 1e9
    return active_lots(lot_store.all(), grace_hours=grace)


@router.get("", response_model=LotListResponse)
def list_lots(
    q: str | None = None,
    make: str | None = None,
    model: str | None = None,
    year_from: int | None = Query(None, alias="yearFrom"),
    year_to: int | None = Query(None, alias="yearTo"),
    auction: list[str] | None = Query(None),
    price_min: float | None = Query(None, alias="priceMin"),
    price_max: float | None = Query(None, alias="priceMax"),
    body: str | None = None,
    damage: str | None = None,
    drive: str | None = None,
    trans: str | None = None,
    fuel: str | None = None,
    mileage_max: int | None = Query(None, alias="mileageMax"),
    eng_min: float | None = Query(None, alias="engMin"),
    eng_max: float | None = Query(None, alias="engMax"),
    run: bool = False,
    buynow: bool = False,
    tab: str = "all",
    region: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=500, alias="pageSize"),
    sort: str = Query("date", pattern="^(date|price|year)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
) -> LotListResponse:
    filters = LotFilters(
        q=q,
        make=make,
        model=model,
        year_from=year_from,
        year_to=year_to,
        auctions=auction or None,
        price_min=price_min,
        price_max=price_max,
        body=body,
        damage=damage,
        drive=drive,
        trans=trans,
        fuel=fuel,
        mileage_max=mileage_max,
        eng_min=eng_min,
        eng_max=eng_max,
        run=run,
        buynow=buynow,
        tab=tab if tab in {"all", "passable", "open", "buy-now"} else "all",  # type: ignore[arg-type]
        region=region,
    )
    items = filter_lots(_catalog_lots(), filters)

    reverse = order == "desc"
    if sort == "price":
        items.sort(key=lambda x: x.currentBid, reverse=reverse)
    elif sort == "year":
        items.sort(key=lambda x: x.year, reverse=reverse)
    else:
        items.sort(key=lambda x: x.auctionDate or "", reverse=reverse)

    total = len(items)
    pages = max(1, math.ceil(total / page_size)) if total else 1
    start = (page - 1) * page_size
    page_items = items[start : start + page_size]

    return LotListResponse(
        items=page_items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        counts={
            "usa": sum(1 for x in items if x.region == "usa"),
            "uk": sum(1 for x in items if x.region == "uk"),
        },
    )


@router.get("/featured", response_model=list[AuctionLot])
def featured_lots(limit: int = Query(4, ge=1, le=24)) -> list[AuctionLot]:
    now = datetime.now(timezone.utc)
    window_ms = 12 * 60 * 60 * 1000
    pool = _catalog_lots()

    def score(lot: AuctionLot) -> tuple[int, float]:
        try:
            ts = datetime.fromisoformat(lot.auctionDate.replace("Z", "+00:00")).timestamp() * 1000
        except Exception:
            return (1, 1e18)
        live = 0 if abs(ts - now.timestamp() * 1000) <= window_ms or ts >= now.timestamp() * 1000 - window_ms else 1
        return (live, abs(ts - now.timestamp() * 1000))

    ranked = sorted(pool, key=score)
    return ranked[:limit]


@router.get("/meta", response_model=LotMetaResponse)
def lots_meta() -> LotMetaResponse:
    lots = _catalog_lots()
    return LotMetaResponse(
        makes=unique_sorted([l.make for l in lots]),
        models=unique_sorted([l.model for l in lots]),
        sources=unique_sorted([l.source for l in lots]),
        regions=unique_sorted([l.region for l in lots]),
        damages=unique_sorted([l.primaryDamage for l in lots]),
        body_styles=unique_sorted([l.bodyStyle for l in lots]),
        total=len(lots),
        counts_by_region={
            "usa": sum(1 for l in lots if l.region == "usa"),
            "uk": sum(1 for l in lots if l.region == "uk"),
        },
        counts_by_source={
            src: sum(1 for l in lots if l.source == src)
            for src in sorted({l.source for l in lots})
        },
    )


@router.get("/{slug}", response_model=AuctionLot)
def get_lot(slug: str) -> AuctionLot:
    lot = lot_store.get_by_slug(slug) or lot_store.get_by_id(slug)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    settings = get_settings()
    if settings.scraper_prune_ended and is_auction_ended(
        lot, grace_hours=settings.scraper_auction_grace_hours
    ):
        raise HTTPException(status_code=404, detail="Lot auction ended")
    return lot


@router.put("/{lot_id}", response_model=AuctionLot, dependencies=[Depends(_require_ingest_key)])
def upsert_lot(lot_id: str, payload: AuctionLot) -> AuctionLot:
    settings = get_settings()
    data = payload.model_copy(update={"id": lot_id})
    lot = lot_store.upsert(data)
    if settings.scraper_persist:
        lot_store.persist()
    return lot


@router.post("/bulk", response_model=LotBulkUpsertResponse, dependencies=[Depends(_require_ingest_key)])
def bulk_upsert(lots: list[AuctionLot]) -> LotBulkUpsertResponse:
    settings = get_settings()
    n = lot_store.upsert_many(lots)
    persisted = 0
    if settings.scraper_persist and n:
        persisted = lot_store.persist()
    return LotBulkUpsertResponse(upserted=n, total=len(lot_store), persisted=persisted)


@router.delete("/{lot_id}", dependencies=[Depends(_require_ingest_key)])
def delete_lot(lot_id: str) -> dict[str, bool]:
    ok = lot_store.delete(lot_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Lot not found")
    return {"deleted": True}


@router.post("/prune-ended", dependencies=[Depends(_require_ingest_key)])
def prune_ended_lots() -> dict[str, int]:
    """Remove lots whose auction date has passed; rewrite api/data/lots.json."""
    settings = get_settings()
    removed = lot_store.prune_ended()
    persisted = 0
    if removed and settings.scraper_persist:
        persisted = lot_store.persist()
    return {"removed": removed, "remaining": len(lot_store), "persisted": persisted}


@router.post("/reload", dependencies=[Depends(_require_ingest_key)])
def reload_from_disk() -> dict[str, int]:
    count = lot_store.reload()
    return {"loaded": count}
