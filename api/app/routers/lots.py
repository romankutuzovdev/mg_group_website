from __future__ import annotations

import logging
import math
import threading
import time
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
from app.services.filter_lots import LotFilters, unique_sorted

logger = logging.getLogger("mg.lots")

router = APIRouter(prefix="/lots", tags=["lots"])

# Fixed keys — old Windows builds omitted korea/china and the UI showed «Под заказ».
_REGION_KEYS = ("usa", "uk", "korea", "china")


def _require_ingest_key(
    settings: Annotated[Settings, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    expected = settings.ingest_api_key.strip()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


# /lots/meta scans the region. Visitors get the last result while one background
# thread refreshes it; only the very first request for a region waits.
_FACETS_TTL = 120.0
_facets: dict[str, tuple[float, list[tuple]]] = {}
_meta_cache: dict[tuple[str, str, float], LotMetaResponse] = {}
_facets_lock = threading.Lock()
_facets_refreshing: set[str] = set()


def _refresh_facets(key: str) -> None:
    try:
        _facets[key] = (time.monotonic(), lot_store.facets(key or None))
    except Exception:
        logger.exception("lots facets rebuild failed")
    finally:
        with _facets_lock:
            _facets_refreshing.discard(key)


def _region_facets(region: str | None) -> tuple[float, list[tuple]]:
    key = (region or "").strip().lower()
    hit = _facets.get(key)
    if hit is None:
        hit = _facets[key] = (time.monotonic(), lot_store.facets(key or None))
    elif time.monotonic() - hit[0] >= _FACETS_TTL:
        with _facets_lock:
            start = key not in _facets_refreshing
            _facets_refreshing.add(key)
        if start:
            threading.Thread(target=_refresh_facets, args=(key,), daemon=True).start()
    return hit


def _top_makes(rows: list[tuple], *, region: str = "usa", limit: int = 8) -> list[dict]:
    """Most common makes in a region, with the lowest current bid."""
    buckets: dict[str, dict] = {}
    for make, _, _, row_region, *_rest, currency, count, min_bid in rows:
        if (row_region or "").lower() != region:
            continue
        name = (make or "").strip()
        if not name:
            continue
        row = buckets.setdefault(
            name.lower(),
            {"make": name, "count": 0, "min_bid": 0.0, "currency": currency or "USD"},
        )
        row["count"] += count
        if min_bid and (row["min_bid"] <= 0 or min_bid < row["min_bid"]):
            row["min_bid"] = min_bid
            row["currency"] = currency or row["currency"]
    ranked = sorted(buckets.values(), key=lambda row: int(row["count"]), reverse=True)
    return ranked[:limit]


def _slim_lot_for_list(lot: AuctionLot) -> AuctionLot:
    """Return a card payload with one small cover instead of the full gallery."""
    imgs = [
        u.strip()
        for u in ([lot.imageUrl] if lot.imageUrl else []) + list(lot.imageUrls or [])
        if (u or "").strip()
    ]
    seen: set[str] = set()
    gallery: list[str] = []
    for u in imgs:
        key = u[:-7] if u.endswith("-th.jpg") else u
        if key in seen:
            continue
        seen.add(key)
        gallery.append(u)

    from app.services.lot_photos import is_our_photo, to_catalog_thumb_url

    ours = [u for u in gallery if is_our_photo(u) and not u.endswith("-th.jpg")]
    cover = ours[0] if ours else (gallery[0] if gallery else "")
    if cover.startswith("/api/lot-photos/"):
        try:
            from app.services.lot_photos import thumb_file_exists

            if thumb_file_exists(cover):
                cover = to_catalog_thumb_url(cover)
        except Exception:
            pass
    elif cover and is_our_photo(cover):
        # R2 upload promotes the generated thumb alongside the display JPEG.
        cover = to_catalog_thumb_url(cover)
    return lot.model_copy(
        update={
            "imageUrl": cover,
            "imageUrls": [cover] if cover else None,
            "photoCount": max(1, len(gallery)) if gallery else 0,
            "similarSold": None,
        }
    )


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
    own_photo: bool = Query(False, alias="ownPhoto"),
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
    page_items, total, region_counts = lot_store.query_lots(
        filters,
        sort=sort,
        order=order,
        limit=page_size,
        offset=(page - 1) * page_size,
        own_photo=own_photo,
    )
    pages = max(1, math.ceil(total / page_size)) if total else 1

    # List cards only need a cover thumb — full galleries live on GET /lots/{slug}.
    # Sending 40 CDN URLs × N lots made pagination payloads huge and infinite
    # scroll stalled after the first page(s).
    slim_items = [_slim_lot_for_list(lot) for lot in page_items]

    # Always emit all catalog regions (even 0) so clients never hide Korea/China.
    counts = {key: region_counts.get(key, 0) for key in _REGION_KEYS}

    return LotListResponse(
        items=slim_items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        counts=counts,
    )


@router.get("/featured", response_model=list[AuctionLot])
def featured_lots(limit: int = Query(4, ge=1, le=24)) -> list[AuctionLot]:
    return [_slim_lot_for_list(lot) for lot in lot_store.closest_to_now(limit)]


@router.get("/meta", response_model=LotMetaResponse)
def lots_meta(make: str | None = None, region: str | None = None) -> LotMetaResponse:
    built_at, rows = _region_facets(region)
    make_key = (make or "").strip().lower()
    region_key = (region or "").strip().lower()
    cache_key = (region_key, make_key, built_at)
    cached = _meta_cache.get(cache_key)
    if cached is not None:
        return cached

    def values(index: int) -> list[str | None]:
        return [row[index] for row in rows]

    counts_by_region = {key: 0 for key in _REGION_KEYS}
    counts_by_source: dict[str, int] = {}
    total = 0
    for row in rows:
        count = row[10]
        total += count
        counts_by_source[row[2]] = counts_by_source.get(row[2], 0) + count
        if row[3] in counts_by_region:
            counts_by_region[row[3]] += count
    response = LotMetaResponse(
        makes=unique_sorted(values(0)),
        models=unique_sorted(
            [row[1] for row in rows if not make_key or (row[0] or "").lower() == make_key]
        ),
        sources=unique_sorted(values(2)),
        regions=unique_sorted(values(3)),
        damages=unique_sorted(values(4)),
        body_styles=unique_sorted(
            [v for v in values(5) if v and "LOTFEATURE" not in v.upper()]
        ),
        fuels=unique_sorted([v for v in values(6) if v and v != "—"]),
        transmissions=unique_sorted([v for v in values(7) if v and v not in {"—", "Na"}]),
        drives=unique_sorted([v for v in values(8) if v and v != "—"]),
        total=total,
        counts_by_region=counts_by_region,
        top_makes=_top_makes(rows, region=region_key or "usa"),
        counts_by_source=dict(sorted(counts_by_source.items())),
    )
    if len(_meta_cache) > 500:
        _meta_cache.clear()
    _meta_cache[cache_key] = response
    return response


@router.get("/{slug}", response_model=AuctionLot)
def get_lot(slug: str) -> AuctionLot:
    """Lot detail — include ended lots so /auctions/{{slug}} can show closed state."""
    lot = lot_store.get_by_slug(slug) or lot_store.get_by_id(slug)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return lot.model_copy(update={"similarSold": lot_store.similar_sold(lot)})


@router.post("/{slug}/gallery")
async def lot_gallery(slug: str) -> dict:
    """All photos of a China lot. The first call reads them from Autohome in Chrome."""
    from app.services.china_gallery import ensure_china_gallery

    lot = lot_store.get_by_slug(slug) or lot_store.get_by_id(slug)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return await ensure_china_gallery(lot)


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
    settings = get_settings()
    ok = lot_store.delete(lot_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Lot not found")
    if settings.scraper_persist:
        lot_store.persist()
    return {"deleted": True}


@router.post("/prune-ended", dependencies=[Depends(_require_ingest_key)])
def prune_ended_lots() -> dict[str, int]:
    """Remove lots whose auction date has passed."""
    settings = get_settings()
    removed = lot_store.prune_ended()
    persisted = 0
    if removed and settings.scraper_persist:
        persisted = lot_store.persist()
    return {"removed": removed, "remaining": len(lot_store), "persisted": persisted}


@router.post("/purge-region", dependencies=[Depends(_require_ingest_key)])
def purge_region_lots(
    region: str = Query(..., min_length=2, max_length=16),
) -> dict[str, int | str]:
    """Delete every lot in a region (usa / uk / korea / china) and persist."""
    settings = get_settings()
    key = region.strip().lower()
    if key not in {"usa", "uk", "korea", "china"}:
        raise HTTPException(status_code=400, detail="Unknown region")
    removed = lot_store.delete_region(key)
    persisted = 0
    if settings.scraper_persist:
        persisted = lot_store.persist()
    return {
        "region": key,
        "removed": removed,
        "persisted": persisted,
        "remaining": len(lot_store),
    }


@router.post("/reload", dependencies=[Depends(_require_ingest_key)])
def reload_from_disk() -> dict[str, int]:
    count = lot_store.reload()
    return {"loaded": count}
