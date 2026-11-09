"""Internal sync between scraper (Windows) and public API (VPS)."""

from __future__ import annotations

import asyncio
import gzip
import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from app.config import Settings, get_settings
from app.data.store import lot_store
from app.services.cabinet_backup import (
    backup_status,
    build_backup_zip,
    pull_cabinet_once,
)
from app.services.lots_sync import (
    BATCH_SIZE,
    apply_catalog_payload,
    export_batch,
    iter_export_json,
    pull_catalog_once,
    push_catalog_once,
    sync_status,
)
from app.services.scraper_proxy import scraper_api_base

router = APIRouter(prefix="/internal", tags=["internal"])


def _require_ingest_key(
    settings: Annotated[Settings, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    expected = (settings.ingest_api_key or "").strip()
    if not expected:
        # Dev: open. Prod must set INGEST_API_KEY on both nodes.
        return
    if (x_api_key or "").strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


def _require_public_role() -> None:
    if (get_settings().app_role or "").strip().lower() != "public":
        raise HTTPException(
            status_code=400,
            detail="lots ingest only on APP_ROLE=public",
        )


@router.get("/lots-catalog", dependencies=[Depends(_require_ingest_key)])
def export_lots_catalog() -> StreamingResponse:
    """Full auction catalog as one document, streamed (CDN photo URLs)."""
    return StreamingResponse(iter_export_json(), media_type="application/json")


@router.get("/lots-delta", dependencies=[Depends(_require_ingest_key)])
def export_lots_delta(
    after: int = Query(0, ge=0),
    limit: int = Query(BATCH_SIZE, ge=1, le=5000),
) -> Response:
    """Lot changes after a position, for a public node that pulls."""
    body = gzip.compress(json.dumps(export_batch(after, limit), ensure_ascii=False).encode("utf-8"), 5)
    return Response(body, media_type="application/json", headers={"Content-Encoding": "gzip"})


@router.get("/lots-sync-state", dependencies=[Depends(_require_ingest_key)])
def lots_sync_state() -> dict:
    """How far this node has applied the scraper's changes."""
    return lot_store.sync_state()


@router.post("/lots-delta", dependencies=[Depends(_require_ingest_key)])
async def lots_delta_ingest(request: Request) -> dict:
    """One batch of lot changes from the Windows scraper (APP_ROLE=public)."""
    _require_public_role()
    raw = await request.body()

    def _apply() -> dict:
        body = gzip.decompress(raw) if request.headers.get("content-encoding") == "gzip" else raw
        return lot_store.apply_delta(json.loads(body))

    try:
        return await asyncio.to_thread(_apply)
    except (OSError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)[:300]) from exc


@router.get("/lots-sync-status")
def lots_sync_status() -> dict:
    """Last pull (VPS) or push (Windows) stats."""
    settings = get_settings()
    return {
        "app_role": settings.app_role,
        "lots_source_url": (settings.lots_source_url or "")[:120],
        "lots_push_url": (settings.lots_push_url or "")[:120],
        "public_site_url": (settings.public_site_url or "")[:120],
        "scraper_api_url": scraper_api_base()[:120],
        "interval_seconds": settings.lots_sync_interval_seconds,
        "push_interval_seconds": settings.lots_push_interval_seconds,
        **sync_status(),
    }


@router.post("/lots-sync-now", dependencies=[Depends(_require_ingest_key)])
async def lots_sync_now() -> dict:
    """Force one catalog pull (APP_ROLE=public) or push (scraper with LOTS_PUSH_URL)."""
    settings = get_settings()
    role = (settings.app_role or "").strip().lower()
    try:
        if role == "public":
            return await pull_catalog_once()
        if role in {"scraper", "all"} and (settings.lots_push_url or "").strip():
            return await push_catalog_once()
        raise HTTPException(
            status_code=400,
            detail="lots-sync-now: public needs LOTS_SOURCE_URL; scraper needs LOTS_PUSH_URL",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc


@router.post("/lots-ingest", dependencies=[Depends(_require_ingest_key)])
async def lots_ingest(payload: dict) -> dict:
    """Receive full catalog from a Windows scraper on the old push (APP_ROLE=public)."""
    _require_public_role()
    try:
        count = await asyncio.to_thread(apply_catalog_payload, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)[:300]) from exc
    return {
        "ok": True,
        "count": count,
        "counts": payload.get("counts") if isinstance(payload, dict) else None,
    }


@router.get("/cabinet-backup", dependencies=[Depends(_require_ingest_key)])
def export_cabinet_backup() -> Response:
    """Zip of cabinet.db + uploads/ for migrating cabinet to the VPS/hoster."""
    try:
        data, meta = build_backup_zip()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)[:300]) from exc
    headers = {
        "Content-Disposition": 'attachment; filename="cabinet-backup.zip"',
        "X-Cabinet-Files": str(meta.get("files", 0)),
        "X-Cabinet-Db-Size": str(meta.get("db_size", 0)),
    }
    return Response(content=data, media_type="application/zip", headers=headers)


@router.get("/cabinet-pull-status")
def cabinet_pull_status() -> dict:
    settings = get_settings()
    return {
        "app_role": settings.app_role,
        "cabinet_source_url": (settings.cabinet_source_url or "")[:120],
        "cabinet_db_path": settings.cabinet_db_path,
        **backup_status(),
    }


@router.post("/cabinet-pull-now", dependencies=[Depends(_require_ingest_key)])
async def cabinet_pull_now() -> dict:
    """Download cabinet backup from Windows and restore on this public node."""
    settings = get_settings()
    if (settings.app_role or "").strip().lower() != "public":
        raise HTTPException(
            status_code=400,
            detail="cabinet-pull-now only on APP_ROLE=public",
        )
    try:
        return await pull_cabinet_once()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc
