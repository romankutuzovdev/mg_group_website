"""Cabinet DB + uploads: export (Windows) → pull (VPS / hoster).

All cabinet data lives in one SQLite file + uploads/:
  users, deals, logistics, purchased cars, car search, quote history.

Export: GET /api/v1/internal/cabinet-backup  (INGEST_API_KEY)
Pull:   POST /api/v1/internal/cabinet-pull-now  (APP_ROLE=public)
  or:   sudo bash api/deploy/vps/pull-cabinet.sh
"""

from __future__ import annotations

import io
import logging
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger("mg.cabinet_backup")

_status: dict[str, Any] = {
    "last_ok_at": None,
    "last_error": None,
    "last_bytes": 0,
    "last_files": 0,
}


def backup_status() -> dict[str, Any]:
    return dict(_status)


def _db_path() -> Path:
    return Path(get_settings().cabinet_db_path).expanduser().resolve()


def _uploads_dir() -> Path:
    return Path(get_settings().cabinet_uploads_dir).expanduser().resolve()


def _checkpoint_wal(db: Path) -> None:
    """Flush WAL into the main DB so a file copy is consistent."""
    if not db.is_file():
        return
    try:
        with sqlite3.connect(str(db), timeout=60) as conn:
            conn.execute("PRAGMA busy_timeout = 60000")
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except sqlite3.Error as exc:
        logger.warning("WAL checkpoint failed: %s", exc)


def build_backup_zip() -> tuple[bytes, dict[str, Any]]:
    """Zip cabinet.db (+ -wal/-shm if any) and uploads/ into memory."""
    db = _db_path()
    uploads = _uploads_dir()
    _checkpoint_wal(db)

    buf = io.BytesIO()
    file_count = 0
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "manifest.json",
            (
                '{"created_at":"%s","db":"cabinet.db","uploads":"uploads/"}'
                % datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            ),
        )
        if db.is_file():
            zf.write(db, arcname="cabinet.db")
            file_count += 1
            for suffix in ("-wal", "-shm"):
                side = Path(str(db) + suffix)
                if side.is_file() and side.stat().st_size:
                    zf.write(side, arcname=f"cabinet.db{suffix}")
                    file_count += 1
        if uploads.is_dir():
            for path in uploads.rglob("*"):
                if path.is_file():
                    rel = path.relative_to(uploads).as_posix()
                    zf.write(path, arcname=f"uploads/{rel}")
                    file_count += 1

    data = buf.getvalue()
    meta = {
        "bytes": len(data),
        "files": file_count,
        "db_exists": db.is_file(),
        "db_size": db.stat().st_size if db.is_file() else 0,
    }
    return data, meta


def restore_backup_zip(data: bytes, *, replace: bool = True) -> dict[str, Any]:
    """Extract backup zip onto this node (stops writers briefly via replace)."""
    db = _db_path()
    uploads = _uploads_dir()
    db.parent.mkdir(parents=True, exist_ok=True)
    uploads.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="mg-cab-") as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
            zf.extractall(tmp_path)

        src_db = tmp_path / "cabinet.db"
        if not src_db.is_file():
            raise RuntimeError("backup zip missing cabinet.db")

        # Remove WAL sidecars so SQLite opens the restored main file cleanly
        for side in (Path(str(db) + "-wal"), Path(str(db) + "-shm")):
            side.unlink(missing_ok=True)

        if replace and db.is_file():
            bak = db.with_suffix(
                f".db.bak-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
            )
            shutil.copy2(db, bak)

        shutil.copy2(src_db, db)

        src_uploads = tmp_path / "uploads"
        files = 1
        if src_uploads.is_dir():
            if replace:
                # Merge: copy files from backup over existing
                for path in src_uploads.rglob("*"):
                    if path.is_file():
                        rel = path.relative_to(src_uploads)
                        dest = uploads / rel
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(path, dest)
                        files += 1
            else:
                shutil.copytree(src_uploads, uploads, dirs_exist_ok=True)

    # Re-open stores against the new file (same path; reset ready flags).
    try:
        from app.services.cabinet_store import cabinet_store
        from app.services.logistics_store import logistics_store
        from app.services.purchased_cars_store import purchased_cars_store
        from app.services import car_search, quote_history

        for store in (cabinet_store, logistics_store, purchased_cars_store):
            if hasattr(store, "_ready"):
                store._ready = False
            store.init()
        quote_history.init()
        car_search.init()
    except Exception as exc:
        logger.warning("store re-init after restore: %s", exc)

    result = {
        "ok": True,
        "db_path": str(db),
        "db_size": db.stat().st_size,
        "files_restored": files,
        "at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
    _status["last_ok_at"] = result["at"]
    _status["last_error"] = None
    _status["last_bytes"] = len(data)
    _status["last_files"] = files
    return result


async def pull_cabinet_once() -> dict[str, Any]:
    """Download backup from Windows and restore onto this (public) node."""
    settings = get_settings()
    url = (settings.cabinet_source_url or "").strip()
    if not url:
        raise RuntimeError("CABINET_SOURCE_URL not set")
    key = (
        settings.cabinet_source_api_key
        or settings.lots_source_api_key
        or settings.ingest_api_key
        or ""
    ).strip()
    headers = {"X-API-Key": key} if key else {}

    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=30.0)) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.content

    if len(data) < 100 or data[:2] != b"PK":
        raise RuntimeError(
            f"cabinet backup does not look like a zip ({len(data)} bytes)"
        )

    return restore_backup_zip(data, replace=True)
