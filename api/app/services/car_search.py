"""Per-manager car search. New matching lots are sent to that manager in Telegram."""

from __future__ import annotations

import asyncio
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.data.store import lot_store
from app.models.lots import AuctionLot
from app.services.telegram_notify import _escape, send_telegram_message

logger = logging.getLogger(__name__)


def _path() -> Path:
    return Path(get_settings().cabinet_db_path)

_SITE = "https://www.mg-group.by"
_NOTIFY_NOW = 3
_NOTIFY_PER_CYCLE = 5


def init() -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS car_searches (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              telegram_id INTEGER NOT NULL,
              region TEXT NOT NULL DEFAULT '',
              make TEXT NOT NULL DEFAULT '',
              model TEXT NOT NULL DEFAULT '',
              year_from INTEGER,
              year_to INTEGER,
              max_bid REAL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS car_search_hits (
              search_id INTEGER NOT NULL,
              lot_id TEXT NOT NULL,
              notified_at TEXT NOT NULL,
              PRIMARY KEY (search_id, lot_id)
            );
            CREATE INDEX IF NOT EXISTS idx_car_searches_user ON car_searches(user_id, id DESC);
            """
        )


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_path())
    conn.row_factory = sqlite3.Row
    return conn


def _search_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "telegram_id": row["telegram_id"],
        "region": row["region"] or "",
        "make": row["make"] or "",
        "model": row["model"] or "",
        "year_from": row["year_from"],
        "year_to": row["year_to"],
        "max_bid": row["max_bid"],
        "created_at": row["created_at"],
    }


def list_for_user(user_id: int) -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM car_searches WHERE user_id = ? ORDER BY id DESC",
            (user_id,),
        ).fetchall()
    return [_search_row(row) for row in rows]


def list_active() -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM car_searches ORDER BY id").fetchall()
    return [_search_row(row) for row in rows]


def create_search(
    *,
    user_id: int,
    telegram_id: int,
    region: str,
    make: str,
    model: str,
    year_from: int | None,
    year_to: int | None,
    max_bid: float | None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO car_searches
              (user_id, telegram_id, region, make, model, year_from, year_to, max_bid, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                telegram_id,
                region.strip().lower(),
                make.strip(),
                model.strip(),
                year_from,
                year_to,
                max_bid,
                now,
            ),
        )
        search_id = int(cur.lastrowid)
        row = conn.execute("SELECT * FROM car_searches WHERE id = ?", (search_id,)).fetchone()
    search = _search_row(row)
    matches = matching_lots(search)
    # Remember the catalog that already exists. Telegram gets only a short sample,
    # then later cycles notify about lots that were not in the catalog yet.
    sample = matches[:_NOTIFY_NOW]
    rest_ids = [lot.id for lot in matches[_NOTIFY_NOW:]]
    mark_hits(search["id"], rest_ids)
    search["sample"] = sample
    search["catalog_count"] = len(matches)
    return search


def delete_search(user_id: int, search_id: int) -> bool:
    with _conn() as conn:
        cur = conn.execute(
            "DELETE FROM car_searches WHERE id = ? AND user_id = ?",
            (search_id, user_id),
        )
        conn.execute("DELETE FROM car_search_hits WHERE search_id = ?", (search_id,))
        return cur.rowcount > 0


def _seen(search_id: int) -> set[str]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT lot_id FROM car_search_hits WHERE search_id = ?",
            (search_id,),
        ).fetchall()
    return {str(row["lot_id"]) for row in rows}


def mark_hits(search_id: int, lot_ids: list[str]) -> None:
    if not lot_ids:
        return
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.executemany(
            """
            INSERT OR IGNORE INTO car_search_hits (search_id, lot_id, notified_at)
            VALUES (?, ?, ?)
            """,
            [(search_id, lot_id, now) for lot_id in lot_ids],
        )


def matches(search: dict[str, Any], lot: AuctionLot) -> bool:
    if getattr(lot, "sold", False):
        return False
    region = (search.get("region") or "").strip().lower()
    if region and (lot.region or "").lower() != region:
        return False
    make = (search.get("make") or "").strip().lower()
    if make and make not in (lot.make or "").lower():
        return False
    model = (search.get("model") or "").strip().lower()
    if model and model not in (lot.model or "").lower():
        return False
    year_from = search.get("year_from")
    if year_from and int(lot.year or 0) < int(year_from):
        return False
    year_to = search.get("year_to")
    if year_to and int(lot.year or 0) > int(year_to):
        return False
    max_bid = search.get("max_bid")
    if max_bid and float(max_bid) > 0 and float(lot.currentBid or 0) > float(max_bid):
        return False
    return True


def matching_lots(search: dict[str, Any]) -> list[AuctionLot]:
    found = [lot for lot in lot_store.all() if matches(search, lot)]
    found.sort(key=lambda lot: lot.auctionDate or "", reverse=True)
    return found


def unseen_lots(search: dict[str, Any], *, limit: int) -> list[AuctionLot]:
    seen = _seen(int(search["id"]))
    out: list[AuctionLot] = []
    for lot in matching_lots(search):
        if lot.id in seen:
            continue
        out.append(lot)
        if len(out) >= limit:
            break
    return out


def _lot_text(search: dict[str, Any], lot: AuctionLot, *, headline: str) -> str:
    query = " ".join(
        part
        for part in (
            search.get("make") or "",
            search.get("model") or "",
            search.get("region") or "",
        )
        if part
    )
    price = f"${int(round(float(lot.currentBid or 0))):,}".replace(",", " ")
    url = f"{_SITE}/auctions/{lot.slug}/"
    lines = [
        f"<b>{_escape(headline)}</b>",
        _escape(f"{lot.year} {lot.make} {lot.model}".strip()),
        _escape(f"{(lot.region or '').upper()} · {lot.source}"),
        f"Ставка: {price} { _escape(lot.currency or 'USD') }",
    ]
    if query:
        lines.append(f"Поиск: {_escape(query)}")
    if lot.lotUrl:
        lines.append(_escape(lot.lotUrl))
    lines.append(f'<a href="{url}">Открыть на сайте</a>')
    return "\n".join(lines)


async def notify_lots(search: dict[str, Any], lots: list[AuctionLot], *, headline: str) -> list[str]:
    sent: list[str] = []
    chat_id = int(search.get("telegram_id") or 0)
    for lot in lots:
        ok = await send_telegram_message(chat_id, _lot_text(search, lot, headline=headline))
        if ok:
            sent.append(lot.id)
    if sent:
        mark_hits(int(search["id"]), sent)
    return sent


async def scan_and_notify() -> int:
    searches = list_active()
    sent = 0
    for search in searches:
        lots = unseen_lots(search, limit=_NOTIFY_PER_CYCLE)
        if not lots:
            continue
        sent += len(await notify_lots(search, lots, headline="Новый лот по вашему поиску"))
    return sent


async def car_search_loop() -> None:
    await asyncio.sleep(60)
    while True:
        try:
            found = await scan_and_notify()
            if found:
                logger.info("car search notified %s lots", found)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("car search scan failed")
        await asyncio.sleep(180)
