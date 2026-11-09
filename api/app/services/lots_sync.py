"""Sync auction catalog between scraper (Windows) and public VPS API.

Only changes travel: every lot write takes a new `seq`, and the public node
remembers how far it got. Each batch is one transaction, so an interrupted
sync resumes where it stopped.

Public node (APP_ROLE=public) — pull OR receive push:
  LOTS_SOURCE_URL=http://WINDOWS/api/v1/internal/lots-catalog
  POST /api/v1/internal/lots-delta  ← Windows pushes here

Scraper node (APP_ROLE=scraper) — push to VPS:
  LOTS_PUSH_URL=http://178.172.138.96/api/v1/internal/lots-ingest
  LOTS_PUSH_INTERVAL_SECONDS=180

The URLs keep their old names: the delta endpoints sit next to them.
Scraper exports CDN-ready URLs (R2); VPS stores lots.db + cabinet.db.
"""

from __future__ import annotations

import asyncio
import gzip
import json
import logging
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import get_settings
from app.data.store import lot_store

logger = logging.getLogger("mg.lots_sync")

# ~3 MB of JSON before gzip: small enough for any proxy limit and for a slow link.
BATCH_SIZE = 2000

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
    """Keep only CDN URLs confirmed during photo promotion.

    ``promote_gallery_urls`` rewrites each local URL only after both the display
    image and its thumbnail upload successfully. Blindly rewriting remaining
    local URLs here used to publish broken R2 links after a partial upload.
    """
    out = dict(lot)
    raw_images = out.get("imageUrls")
    images = [str(url) for url in raw_images if url] if isinstance(raw_images, list) else []
    public_images = [url for url in images if not url.startswith("/api/lot-photos/")]
    cover = str(out.get("imageUrl") or "")
    if cover.startswith("/api/lot-photos/"):
        cover = public_images[0] if public_images else ""
    if images:
        out["imageUrls"] = public_images or None
    out["imageUrl"] = cover
    return out


def _internal_base(url: str) -> str:
    """http://host/api/v1/internal/lots-ingest → http://host/api/v1/internal"""
    return url.strip().rsplit("/", 1)[0]


def export_batch(after: int, limit: int = BATCH_SIZE) -> dict[str, Any]:
    batch = lot_store.export_delta(after, limit)
    batch["lots"] = [_rewrite_local_to_cdn(lot) for lot in batch["lots"]]
    batch["catalog_id"] = lot_store.catalog_id
    return batch


def iter_export_json() -> Iterator[bytes]:
    """Whole catalog as one JSON document, built piece by piece (manual checks)."""
    counts = lot_store.facet_counts()
    head = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "mg-api-scraper-export",
        "counts": {"total": sum(counts.values()), **counts},
    }
    yield json.dumps(head, ensure_ascii=False)[:-1].encode("utf-8") + b', "lots": ['
    first = True
    for lot in lot_store.iter_all():
        data = _rewrite_local_to_cdn(lot.model_dump(exclude_none=True))
        yield (b"" if first else b",") + json.dumps(data, ensure_ascii=False).encode("utf-8")
        first = False
    yield b"]}"


def apply_catalog_payload(payload: dict[str, Any]) -> int:
    """Full catalog from a scraper node still on the old push."""
    items = payload.get("lots", payload) if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        raise ValueError("catalog payload missing lots[]")
    return lot_store.replace_all(items)


def _mark_ok(mode: str, url: str, sent: int, size: int) -> None:
    _status["mode"] = mode
    _status["target_url"] = url[:120]
    _status["last_ok_at"] = datetime.now(timezone.utc).isoformat()
    _status["last_error"] = None
    _status["last_count"] = sent
    _status["last_bytes"] = size


async def pull_catalog_once() -> dict[str, Any]:
    settings = get_settings()
    url = (settings.lots_source_url or "").strip()
    if not url:
        raise RuntimeError("LOTS_SOURCE_URL not set")
    headers: dict[str, str] = {}
    key = (settings.lots_source_api_key or settings.ingest_api_key or "").strip()
    if key:
        headers["X-API-Key"] = key

    base = _internal_base(url)
    state = lot_store.sync_state()
    cursor = int(state["cursor"])
    sent = size = 0
    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=30.0)) as client:
        while True:
            res = await client.get(f"{base}/lots-delta", params={"after": cursor}, headers=headers)
            if res.status_code >= 400:
                raise RuntimeError(f"lots source HTTP {res.status_code}: {(res.text or '')[:200]}")
            batch = res.json()
            # The scraper's database was recreated: its positions mean nothing here.
            if cursor and batch.get("catalog_id") != state["catalog_id"]:
                cursor = 0
                continue
            if batch["to"] == cursor and not batch["lots"] and not batch["deleted"]:
                break
            result = await asyncio.to_thread(lot_store.apply_delta, batch)
            if not result["ok"]:
                raise RuntimeError(f"lots delta rejected at {cursor}")
            cursor = int(batch["to"])
            sent += len(batch["lots"])
            size += len(res.content)
            if batch["done"]:
                break
    _mark_ok("pull", url, sent, size)
    logger.info("lots sync ok: %s changed (%s bytes), total %s", sent, size, len(lot_store))
    return {"ok": True, "count": sent, "bytes": size, "total": len(lot_store)}


async def push_catalog_once() -> dict[str, Any]:
    settings = get_settings()
    url = (settings.lots_push_url or "").strip()
    if not url:
        raise RuntimeError("LOTS_PUSH_URL not set")
    # An empty scraper database must never start a full sync: it would empty the site.
    if not len(lot_store):
        return {"ok": True, "count": 0, "skipped": "empty catalog"}
    key = (settings.lots_push_api_key or settings.ingest_api_key or "").strip()
    headers: dict[str, str] = {"X-API-Key": key} if key else {}

    base = _internal_base(url)
    sent = size = 0
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=60.0)) as client:
        res = await client.get(f"{base}/lots-sync-state", headers=headers)
        if res.status_code >= 300:
            raise RuntimeError(f"lots sync state HTTP {res.status_code}: {(res.text or '')[:200]}")
        state = res.json()
        same_catalog = state.get("catalog_id") == lot_store.catalog_id
        cursor = int(state.get("cursor") or 0) if same_catalog else 0
        while True:
            batch = await asyncio.to_thread(export_batch, cursor)
            if cursor and batch["to"] == cursor and not batch["lots"] and not batch["deleted"]:
                break

            def _encode() -> bytes:
                return gzip.compress(json.dumps(batch, ensure_ascii=False).encode("utf-8"), 5)

            body = await asyncio.to_thread(_encode)
            res = await client.post(
                f"{base}/lots-delta",
                content=body,
                headers={
                    **headers,
                    "Content-Type": "application/json",
                    "Content-Encoding": "gzip",
                },
            )
            if res.status_code >= 300:
                raise RuntimeError(
                    f"lots push HTTP {res.status_code}: "
                    f"{(res.headers.get('location') or res.text or '')[:200]}"
                )
            result = res.json()
            if not result.get("ok"):
                raise RuntimeError(f"lots delta rejected at {cursor}: {result}")
            cursor = int(batch["to"])
            sent += len(batch["lots"])
            size += len(body)
            if batch["done"]:
                break

    _mark_ok("push", url, sent, size)
    logger.info("lots push ok: %s changed, %s bytes → %s", sent, size, url[:80])
    return {"ok": True, "count": sent, "bytes": size}


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
