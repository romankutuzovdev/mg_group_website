from __future__ import annotations

import math
import time
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
from app.services.auction_date import active_lots
from app.services.filter_lots import LotFilters, filter_lots, unique_sorted

router = APIRouter(prefix="/lots", tags=["lots"])

# Fixed keys — old Windows builds omitted korea/china and the UI showed «Под заказ».
_REGION_KEYS = ("usa", "uk", "korea", "china")


def _counts_by_region(lots: list[AuctionLot]) -> dict[str, int]:
    out = {k: 0 for k in _REGION_KEYS}
    for lot in lots:
        if lot.region in out:
            out[lot.region] += 1
    return out


def _top_makes(lots: list[AuctionLot], *, region: str = "usa", limit: int = 8) -> list[dict]:
    """Most common makes in a region, with the lowest current bid."""
    buckets: dict[str, dict] = {}
    for lot in lots:
        if (lot.region or "").lower() != region:
            continue
        name = (lot.make or "").strip()
        if not name:
            continue
        key = name.lower()
        bid = float(lot.currentBid or 0)
        row = buckets.get(key)
        if row is None:
            buckets[key] = {
                "make": name,
                "count": 1,
                "min_bid": bid,
                "currency": lot.currency or "USD",
            }
            continue
        row["count"] += 1
        if bid > 0 and (row["min_bid"] <= 0 or bid < row["min_bid"]):
            row["min_bid"] = bid
            row["currency"] = lot.currency or row["currency"]
    ranked = sorted(buckets.values(), key=lambda row: int(row["count"]), reverse=True)
    return ranked[:limit]


def _require_ingest_key(
    settings: Annotated[Settings, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    expected = settings.ingest_api_key.strip()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


# Opening Korea walks ~70k lots. Rebuild the live snapshot at most every 20s
# and keep each region pre-sorted by auction date so page 1 is a slice.
_SNAPSHOT_TTL = 20.0
_snap_at = 0.0
_snap_ready = False
_snap_all: list[AuctionLot] = []
_snap_region: dict[str, list[AuctionLot]] = {}
_meta_cache: dict[tuple[str, str], LotMetaResponse] = {}


def _refresh_snapshot() -> None:
    global _snap_at, _snap_ready, _snap_all, _snap_region
    now = time.monotonic()
    if _snap_ready and now - _snap_at < _SNAPSHOT_TTL:
        return
    _meta_cache.clear()
    settings = get_settings()
    grace = settings.scraper_auction_grace_hours if settings.scraper_prune_ended else 1e9
    live = [
        lot
        for lot in active_lots(lot_store.all(), grace_hours=grace)
        if not getattr(lot, "sold", False)
    ]
    has_bidcars = any(lot.source == "bidcars" and lot.region == "usa" for lot in live)
    if has_bidcars:
        live = [
            lot
            for lot in live
            if not (lot.region == "usa" and lot.source in {"copart", "iaai"})
        ]
    buckets: dict[str, list[AuctionLot]] = {}
    for lot in live:
        buckets.setdefault((lot.region or "").lower(), []).append(lot)
    for rows in buckets.values():
        rows.sort(key=lambda lot: lot.auctionDate or "", reverse=True)
    live.sort(key=lambda lot: lot.auctionDate or "", reverse=True)
    _snap_all = live
    _snap_region = buckets
    _snap_ready = True
    _snap_at = time.monotonic()


def _catalog_lots() -> list[AuctionLot]:
    """Live catalog. Sold Bid.cars stay in the store for similar sales only."""
    _refresh_snapshot()
    return _snap_all


def _region_pool(region: str | None) -> list[AuctionLot]:
    _refresh_snapshot()
    key = (region or "").strip().lower()
    if not key:
        return _snap_all
    return _snap_region.get(key, [])


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
    bare = not any(
        (
            q,
            make,
            model,
            year_from,
            year_to,
            auction,
            price_min,
            price_max,
            body,
            damage,
            drive,
            trans,
            fuel,
            mileage_max,
            eng_min,
            eng_max,
            run,
            buynow,
        )
    ) and filters.tab == "all"
    if bare and sort == "date" and order == "desc":
        # Already sorted in the snapshot — page 1 does not re-sort 70k rows.
        items = list(_region_pool(region))
    else:
        items = filter_lots(_region_pool(region), filters)
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

    # List cards only need a cover thumb — full galleries live on GET /lots/{slug}.
    # Sending 40 CDN URLs × N lots made pagination payloads huge and infinite
    # scroll stalled after the first page(s).
    slim_items: list[AuctionLot] = []
    for lot in page_items:
        imgs = [
            u.strip()
            for u in ([lot.imageUrl] if lot.imageUrl else [])
            + list(lot.imageUrls or [])
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

        from app.services.lot_photos import is_our_photo

        ours = [
            u
            for u in gallery
            if is_our_photo(u) and not u.endswith("-th.jpg")
        ]
        cover = ours[0] if ours else (gallery[0] if gallery else "")
        if cover.startswith("/api/lot-photos/"):
            try:
                from app.services.lot_photos import (
                    thumb_file_exists,
                    to_catalog_thumb_url,
                )

                if thumb_file_exists(cover):
                    cover = to_catalog_thumb_url(cover)
            except Exception:
                pass
        else:
            try:
                from app.services.r2_photos import is_cdn_photo
                from app.services.lot_photos import to_catalog_thumb_url

                if is_cdn_photo(cover):
                    cover = to_catalog_thumb_url(cover)
            except Exception:
                pass
        slim_items.append(
            lot.model_copy(
                update={
                    "imageUrl": cover,
                    "imageUrls": [cover] if cover else None,
                    "photoCount": max(1, len(gallery)) if gallery else 0,
                }
            )
        )

    # Always emit all catalog regions (even 0) so clients never hide Korea/China.
    counts = {"usa": 0, "uk": 0, "korea": 0, "china": 0}
    for x in items:
        if x.region in counts:
            counts[x.region] += 1

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
def lots_meta(make: str | None = None, region: str | None = None) -> LotMetaResponse:
    lots = _region_pool(region)
    make_key = (make or "").strip().lower()
    cache_key = ((region or "").strip().lower(), make_key)
    cached = _meta_cache.get(cache_key)
    if cached is not None:
        return cached
    model_pool = (
        [l for l in lots if (l.make or "").lower() == make_key] if make_key else lots
    )
    response = LotMetaResponse(
        makes=unique_sorted([l.make for l in lots]),
        models=unique_sorted([l.model for l in model_pool]),
        sources=unique_sorted([l.source for l in lots]),
        regions=unique_sorted([l.region for l in lots]),
        damages=unique_sorted([l.primaryDamage for l in lots]),
        body_styles=unique_sorted(
            [l.bodyStyle for l in lots if l.bodyStyle and "LOTFEATURE" not in (l.bodyStyle or "").upper()]
        ),
        fuels=unique_sorted(
            [l.fuel for l in lots if l.fuel and l.fuel != "—"]
        ),
        transmissions=unique_sorted(
            [
                l.transmission
                for l in lots
                if l.transmission and l.transmission not in {"—", "Na"}
            ]
        ),
        drives=unique_sorted(
            [l.drive for l in lots if l.drive and l.drive != "—"]
        ),
        total=len(lots),
        counts_by_region=_counts_by_region(lots),
        top_makes=_top_makes(lots, region=(region or "usa").strip().lower() or "usa"),
        counts_by_source={
            src: sum(1 for l in lots if l.source == src)
            for src in sorted({l.source for l in lots})
        },
    )
    _meta_cache[cache_key] = response
    return response


@router.get("/{slug}", response_model=AuctionLot)
def get_lot(slug: str) -> AuctionLot:
    """Lot detail — include ended lots so /auctions/{{slug}} can show closed state."""
    lot = lot_store.get_by_slug(slug) or lot_store.get_by_id(slug)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return lot.model_copy(update={"similarSold": lot_store.similar_sold(lot)})


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
