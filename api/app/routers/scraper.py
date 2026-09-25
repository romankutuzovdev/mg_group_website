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
        "copart",
        "iaai",
        "copart_uk",
        "manheim",
        "salvage_market",
        "encar",
        "all",
    ] = Query("all"),
) -> dict:
    """One crawl cycle in shared Chrome tabs (newly listed)."""
    return await scraper_worker.run_once(sources=sources)
