from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.config import Settings, get_settings
from app.scraper.worker import scraper_worker

router = APIRouter(prefix="/scraper", tags=["scraper"])


def _require_key(
    settings: Annotated[Settings, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    expected = settings.ingest_api_key.strip()
    if not expected:
        return
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


@router.get("/status")
def scraper_status() -> dict:
    return scraper_worker.snapshot()


@router.post("/start", dependencies=[Depends(_require_key)])
async def scraper_start() -> dict:
    """Start 24/7 loop: one Chrome, one tab per auction source → upsert store."""
    return await scraper_worker.start()


@router.post("/stop", dependencies=[Depends(_require_key)])
async def scraper_stop() -> dict:
    return await scraper_worker.stop()


@router.post("/run-once", dependencies=[Depends(_require_key)])
async def scraper_run_once(
    sources: Literal[
        "bidcars",
        "copart",
        "iaai",
        "copart_uk",
        "manheim",
        "salvage_market",
        "encar",
        "china_market",
        "all",
    ] = Query("all"),
) -> dict:
    """One crawl cycle in shared Chrome tabs (newly listed)."""
    return await scraper_worker.run_once(sources=sources)


@router.post("/photos/run-once", dependencies=[Depends(_require_key)])
async def scraper_photos_run_once(
    limit: int = Query(25, ge=1, le=200),
) -> dict:
    """Visit up to `limit` lot detail pages and collect full photo galleries."""
    return await scraper_worker.run_photos_once(limit=limit)


@router.get("/r2-status")
def scraper_r2_status() -> dict:
    """Whether Cloudflare R2 CDN is configured (no secrets)."""
    from app.services.r2_photos import r2_status

    return r2_status()


@router.post("/r2/promote-locals", dependencies=[Depends(_require_key)])
def scraper_r2_promote_locals(
    limit: int = Query(200, ge=1, le=5000),
) -> dict:
    """Upload existing `/api/lot-photos` folders to R2 and rewrite lot URLs to CDN."""
    from app.services.r2_photos import backfill_local_lots_to_r2

    return backfill_local_lots_to_r2(limit=limit)


@router.post("/localize-korea", dependencies=[Depends(_require_key)])
def scraper_localize_korea(
    limit: int = Query(0, ge=0, le=100_000),
) -> dict:
    """Translate Hangul fields on Korea lots in the catalog (dict + free Google).

    ``limit=0`` = all korea lots. Safe to re-run — cached translations skip network.
    """
    from app.services.ko_ru import localize_korea_store

    stats = localize_korea_store(limit=limit, allow_network=True)
    return {"ok": True, **stats}
