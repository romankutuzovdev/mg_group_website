"""Sync auction catalog between scraper (Windows) and public VPS API.

Public node (APP_ROLE=public) — pull OR receive push:
  LOTS_SOURCE_URL=http://WINDOWS/api/v1/internal/lots-catalog
  POST /api/v1/internal/lots-ingest  ← Windows pushes here

Scraper node (APP_ROLE=scraper) — push to VPS:
  LOTS_PUSH_URL=http://178.172.138.96/api/v1/internal/lots-ingest
  LOTS_PUSH_INTERVAL_SECONDS=180

Scraper exports CDN-ready URLs (R2); VPS stores lots.json + cabinet.db.
"""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings
from app.data.store import lot_store
from app.models.lots import AuctionLot

logger = logging.getLogger("mg.lots_sync")

_status: dict[str, Any] = {
    "running": False,
    "mode": None,  # pull | push
    "last_ok_at": None,
    "last_error": None,
    "last_count": 0,
    "last_bytes": 0,
    "target_url": None,
}


def sync_status() -> dict[str, Any]:
    return dict(_status)


def _rewrite_local_to_cdn(lot: dict[str, Any]) -> dict[str, Any]:
    """Best-effort: /api/lot-photos/... → R2 public URL when R2 is configured."""
    try:
        from app.services.r2_photos import local_api_to_cdn_url, r2_enabled

        if not r2_enabled():
            return lot
    except Exception:
        return lot

    def one(u: str) -> str:
        cdn = local_api_to_cdn_url(u)
        return cdn or u

    out = dict(lot)
    if out.get("imageUrl"):
        out["imageUrl"] = one(str(out["imageUrl"]))
    imgs = out.get("imageUrls")
    if isinstance(imgs, list):
        out["imageUrls"] = [one(str(u)) for u in imgs if u]
    return out


def build_export_payload() -> dict[str, Any]:
    """Catalog snapshot for VPS pull (same shape as lots.json persist)."""
    with lot_store._lock:
        lots = [
            _rewrite_local_to_cdn(lot.model_dump(exclude_none=True))
            for lot in lot_store._by_id.values()
        ]
    lots.sort(key=lambda x: float(x.get("currentBid") or 0), reverse=True)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "mg-api-scraper-export",
        "counts": {
            "total": len(lots),
            "usa": sum(1 for l in lots if l.get("region") == "usa"),
            "uk": sum(1 for l in lots if l.get("region") == "uk"),
            "korea": sum(1 for l in lots if l.get("region") == "korea"),
            "china": sum(1 for l in lots if l.get("region") == "china"),
        },
        "lots": lots,
    }


def apply_catalog_payload(payload: dict[str, Any], *, persist: bool = True) -> int:
    """Replace in-memory catalog from export JSON; optionally write lots.json."""
    items = payload.get("lots", payload) if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        raise ValueError("catalog payload missing lots[]")
    lots: list[AuctionLot] = []
    for item in items:
        try:
            lots.append(AuctionLot.model_validate(item))
        except Exception:
            continue
    with lot_store._lock:
        lot_store._by_id = {lot.id: lot for lot in lots}
        lot_store._by_slug = {lot.slug: lot for lot in lots}
        lot_store.revision += 1
    if persist:
        # Write raw payload (already CDN-rewritten) for fast reload
        path = Path(get_settings().lots_json_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    return len(lots)


async def pull_catalog_once() -> dict[str, Any]:
    settings = get_settings()
    url = (settings.lots_source_url or "").strip()
    if not url:
        raise RuntimeError("LOTS_SOURCE_URL not set")
    headers: dict[str, str] = {}
    key = (settings.lots_source_api_key or settings.ingest_api_key or "").strip()
    if key:
        headers["X-API-Key"] = key

    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
        res = await client.get(url, headers=headers)
    if res.status_code >= 400:
        raise RuntimeError(f"lots source HTTP {res.status_code}: {(res.text or '')[:200]}")
    raw = res.content
    payload = res.json()
    if not isinstance(payload, dict):
        raise RuntimeError("lots source returned non-object JSON")

    # Atomic write via temp then apply
    path = Path(settings.lots_json_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb", delete=False, dir=str(path.parent), suffix=".lots-pull.json"
    ) as fh:
        fh.write(raw)
        tmp_name = fh.name
    Path(tmp_name).replace(path)

    count = apply_catalog_payload(payload, persist=False)
    _status["mode"] = "pull"
    _status["target_url"] = url[:120]
    _status["last_ok_at"] = datetime.now(timezone.utc).isoformat()
    _status["last_error"] = None
    _status["last_count"] = count
    _status["last_bytes"] = len(raw)
    logger.info("lots sync ok: %s lots (%s bytes)", count, len(raw))
    return {"ok": True, "count": count, "bytes": len(raw)}


async def push_catalog_once() -> dict[str, Any]:
    """Windows → VPS: POST full catalog to LOTS_PUSH_URL."""
    settings = get_settings()
    url = (settings.lots_push_url or "").strip()
    if not url:
        raise RuntimeError("LOTS_PUSH_URL not set")
    key = (settings.lots_push_api_key or settings.ingest_api_key or "").strip()
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if key:
        headers["X-API-Key"] = key

    payload = build_export_payload()
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
        res = await client.post(url, content=raw, headers=headers)
    if res.status_code >= 400:
        raise RuntimeError(f"lots push HTTP {res.status_code}: {(res.text or '')[:200]}")

    count = int(payload.get("counts", {}).get("total") or len(payload.get("lots") or []))
    _status["mode"] = "push"
    _status["target_url"] = url[:120]
    _status["last_ok_at"] = datetime.now(timezone.utc).isoformat()
    _status["last_error"] = None
    _status["last_count"] = count
    _status["last_bytes"] = len(raw)
    logger.info("lots push ok: %s lots → %s", count, url[:80])
    try:
        body = res.json()
    except Exception:
        body = {"ok": True}
    return {"ok": True, "count": count, "bytes": len(raw), "remote": body}


async def lots_sync_loop(stop: asyncio.Event) -> None:
    """Public: pull from Windows. Scraper: push to VPS when LOTS_PUSH_URL set."""
    settings = get_settings()
    role = (settings.app_role or "all").strip().lower()

    if role == "public":
        if not (settings.lots_source_url or "").strip():
            logger.info("APP_ROLE=public: no LOTS_SOURCE_URL — waiting for Windows push")
            return
        interval = max(30, int(settings.lots_sync_interval_seconds or 120))
        _status["running"] = True
        _status["mode"] = "pull"
        _status["target_url"] = settings.lots_source_url.strip()[:120]
        logger.info(
            "lots pull loop ← %s every %ss",
            settings.lots_source_url.strip()[:80],
            interval,
        )
        await asyncio.sleep(5)
        while not stop.is_set():
            try:
                await pull_catalog_once()
            except Exception as exc:
                _status["last_error"] = str(exc)[:300]
                logger.warning("lots pull failed: %s", exc)
            try:
                await asyncio.wait_for(stop.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass
        _status["running"] = False
        return

    if role in {"scraper", "all"} and (settings.lots_push_url or "").strip():
        interval = max(60, int(settings.lots_push_interval_seconds or 180))
        _status["running"] = True
        _status["mode"] = "push"
        _status["target_url"] = settings.lots_push_url.strip()[:120]
        logger.info(
            "lots push loop → %s every %ss",
            settings.lots_push_url.strip()[:80],
            interval,
        )
        await asyncio.sleep(30)
        while not stop.is_set():
            try:
                await push_catalog_once()
            except Exception as exc:
                _status["last_error"] = str(exc)[:300]
                logger.warning("lots push failed: %s", exc)
            try:
                await asyncio.wait_for(stop.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass
        _status["running"] = False
        return
