"""Immutable public quote snapshots; author identity stays in the private store."""

import json
import re
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app import config

_lock = threading.RLock()


def _conn() -> sqlite3.Connection:
    path = Path(config.get_settings().cabinet_db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS quote_shares (
            token TEXT PRIMARY KEY,
            owner_user_id INTEGER NOT NULL,
            snapshot_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"""
    )
    return conn


def _public(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["token"],
        "created_at": row["created_at"],
        "quote": json.loads(row["snapshot_json"]),
    }


def create(*, owner_user_id: int, snapshot: dict[str, Any]) -> dict[str, Any]:
    token = secrets.token_urlsafe(24)
    created = datetime.now(timezone.utc).isoformat()
    encoded = json.dumps(snapshot, ensure_ascii=False, allow_nan=False)
    with _lock:
        conn = _conn()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO quote_shares (token, owner_user_id, snapshot_json, created_at) "
                    "VALUES (?, ?, ?, ?)",
                    (token, owner_user_id, encoded, created),
                )
            row = conn.execute("SELECT * FROM quote_shares WHERE token = ?", (token,)).fetchone()
            return _public(row)
        finally:
            conn.close()


def get(token: str) -> dict[str, Any] | None:
    if not re.fullmatch(r"[A-Za-z0-9_-]{32}", token):
        return None
    with _lock:
        conn = _conn()
        try:
            row = conn.execute("SELECT * FROM quote_shares WHERE token = ?", (token,)).fetchone()
            return _public(row) if row else None
        finally:
            conn.close()
