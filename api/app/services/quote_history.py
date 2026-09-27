"""Saved calculator quotes, one row per settled calculation."""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings

_lock = threading.RLock()


def _path() -> Path:
    return Path(get_settings().cabinet_db_path)


def init() -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS quote_history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              telegram_id INTEGER NOT NULL,
              username TEXT NOT NULL DEFAULT '',
              first_name TEXT NOT NULL DEFAULT '',
              last_name TEXT NOT NULL DEFAULT '',
              kind TEXT NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              lot_url TEXT NOT NULL DEFAULT '',
              location TEXT NOT NULL DEFAULT '',
              bid REAL,
              currency TEXT NOT NULL DEFAULT 'USD',
              total_usd REAL,
              summary TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_quote_history_user ON quote_history(user_id, id DESC)"
        )


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "telegram_id": row["telegram_id"],
        "username": row["username"] or "",
        "first_name": row["first_name"] or "",
        "last_name": row["last_name"] or "",
        "kind": row["kind"],
        "title": row["title"] or "",
        "lot_url": row["lot_url"] or "",
        "location": row["location"] or "",
        "bid": row["bid"],
        "currency": row["currency"] or "USD",
        "total_usd": row["total_usd"],
        "summary": row["summary"] or "",
        "created_at": row["created_at"],
    }


def add_quote(
    *,
    user_id: int,
    telegram_id: int,
    username: str,
    first_name: str,
    last_name: str,
    kind: str,
    title: str,
    lot_url: str,
    location: str,
    bid: float | None,
    currency: str,
    total_usd: float | None,
    summary: str,
) -> dict[str, Any]:
    created = datetime.now(timezone.utc).isoformat()
    with _lock:
        conn = sqlite3.connect(_path())
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.execute(
                """
                INSERT INTO quote_history (
                  user_id, telegram_id, username, first_name, last_name,
                  kind, title, lot_url, location, bid, currency, total_usd, summary, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    telegram_id,
                    username or "",
                    first_name or "",
                    last_name or "",
                    kind,
                    (title or "")[:240],
                    (lot_url or "")[:500],
                    (location or "")[:160],
                    bid,
                    currency or "USD",
                    total_usd,
                    (summary or "")[:500],
                    created,
                ),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM quote_history WHERE id = ?",
                (cur.lastrowid,),
            ).fetchone()
            return _row(row)
        finally:
            conn.close()


def list_for_user(user_id: int, limit: int = 50) -> list[dict[str, Any]]:
    with _lock:
        conn = sqlite3.connect(_path())
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT * FROM quote_history
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
            return [_row(row) for row in rows]
        finally:
            conn.close()


def list_all(limit: int = 200) -> list[dict[str, Any]]:
    with _lock:
        conn = sqlite3.connect(_path())
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                """
                SELECT * FROM quote_history
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [_row(row) for row in rows]
        finally:
            conn.close()
