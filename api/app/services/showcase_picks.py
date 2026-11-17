"""Лоты, которые менеджер из калькулятора отправил на главную или отметил «Купили».

Один лот + тип просчёта = одна запись: повторное нажатие обновляет цифры.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.config import get_settings

PickKind = Literal["restoration", "kit"]

_lock = threading.RLock()


class BreakdownLine(BaseModel):
    label: str = Field(..., max_length=80)
    amount: float


class ShowcasePickIn(BaseModel):
    kind: PickKind
    title: str = Field("", max_length=240)
    year: int | None = Field(None, ge=1950, le=2040)
    make: str = Field("", max_length=80)
    model: str = Field("", max_length=120)
    image_url: str = Field("", max_length=1000)
    lot_url: str = Field("", max_length=500)
    region: str = Field("usa", max_length=20)
    source: str = Field("", max_length=40)
    location: str = Field("", max_length=160)
    damage: str = Field("", max_length=120)
    odometer: str = Field("", max_length=40)
    bid: float | None = Field(None, ge=0)
    currency: Literal["USD", "GBP"] = "USD"
    total_usd: float | None = Field(None, ge=0)
    summary: str = Field("", max_length=500)
    # Снимок просчёта: все фото лота, характеристики и разбивка цены (USD).
    images: list[str] = Field(default_factory=list, max_length=60)
    specs: dict[str, str] = Field(default_factory=dict)
    breakdown: list[BreakdownLine] = Field(default_factory=list, max_length=20)
    on_home: bool | None = None
    bought: bool | None = None


class ShowcasePickPatch(BaseModel):
    on_home: bool | None = None
    bought: bool | None = None
    total_usd: float | None = Field(None, ge=0)


def _path() -> Path:
    return Path(get_settings().cabinet_db_path)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_path())
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS showcase_picks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              year INTEGER,
              make TEXT NOT NULL DEFAULT '',
              model TEXT NOT NULL DEFAULT '',
              image_url TEXT NOT NULL DEFAULT '',
              lot_url TEXT NOT NULL DEFAULT '',
              region TEXT NOT NULL DEFAULT 'usa',
              source TEXT NOT NULL DEFAULT '',
              location TEXT NOT NULL DEFAULT '',
              damage TEXT NOT NULL DEFAULT '',
              odometer TEXT NOT NULL DEFAULT '',
              bid REAL,
              currency TEXT NOT NULL DEFAULT 'USD',
              total_usd REAL,
              summary TEXT NOT NULL DEFAULT '',
              on_home INTEGER NOT NULL DEFAULT 0,
              bought INTEGER NOT NULL DEFAULT 0,
              bought_at TEXT NOT NULL DEFAULT '',
              manager_user_id INTEGER NOT NULL DEFAULT 0,
              manager_name TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_showcase_home
              ON showcase_picks(on_home, bought, kind, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_showcase_lot
              ON showcase_picks(kind, lot_url);
            """
        )
        cols = {r[1] for r in conn.execute("PRAGMA table_info(showcase_picks)").fetchall()}
        for col in ("images_json", "specs_json", "breakdown_json"):
            if col not in cols:
                conn.execute(f"ALTER TABLE showcase_picks ADD COLUMN {col} TEXT NOT NULL DEFAULT ''")


def _loads(raw: str | None, fallback: Any) -> Any:
    try:
        value = json.loads(raw or "")
    except ValueError:
        return fallback
    return value if isinstance(value, type(fallback)) else fallback


def _row(row: sqlite3.Row, *, public: bool = False) -> dict[str, Any]:
    data = {
        "id": row["id"],
        "kind": row["kind"],
        "title": row["title"] or "",
        "year": row["year"],
        "make": row["make"] or "",
        "model": row["model"] or "",
        "image_url": row["image_url"] or "",
        "lot_url": row["lot_url"] or "",
        "region": row["region"] or "usa",
        "source": row["source"] or "",
        "location": row["location"] or "",
        "damage": row["damage"] or "",
        "odometer": row["odometer"] or "",
        "bid": row["bid"],
        "currency": row["currency"] or "USD",
        "total_usd": row["total_usd"],
        "summary": row["summary"] or "",
        "images": _loads(row["images_json"], []),
        "specs": _loads(row["specs_json"], {}),
        "breakdown": _loads(row["breakdown_json"], []),
        "on_home": bool(row["on_home"]),
        "bought": bool(row["bought"]),
        "bought_at": row["bought_at"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    if public:
        # Ссылка на аукцион и площадка — внутренняя кухня, клиенту не показываем.
        data.pop("lot_url")
        data.pop("location")
    else:
        data["manager_user_id"] = row["manager_user_id"]
        data["manager_name"] = row["manager_name"] or ""
    return data


def get(pick_id: int) -> dict[str, Any] | None:
    with _lock, _connect() as conn:
        row = conn.execute("SELECT * FROM showcase_picks WHERE id = ?", (pick_id,)).fetchone()
        return _row(row) if row else None


def upsert(body: ShowcasePickIn, *, manager_user_id: int, manager_name: str) -> dict[str, Any]:
    """Новая запись или обновление той же пары (лот, тип). Флаги меняются, только если переданы."""
    now = _now()
    lot_url = body.lot_url.strip()
    fields = {
        "title": body.title.strip(),
        "year": body.year,
        "make": body.make.strip(),
        "model": body.model.strip(),
        "image_url": body.image_url.strip(),
        "region": (body.region or "usa").strip().lower(),
        "source": body.source.strip(),
        "location": body.location.strip(),
        "damage": body.damage.strip(),
        "odometer": body.odometer.strip(),
        "bid": body.bid,
        "currency": body.currency,
        "total_usd": body.total_usd,
        "summary": body.summary.strip(),
        "images_json": json.dumps(
            [u.strip() for u in body.images if u and u.strip()][:60], ensure_ascii=False
        )
        if body.images
        else "",
        "specs_json": json.dumps(
            {k.strip()[:40]: str(v).strip()[:120] for k, v in body.specs.items() if k.strip() and str(v).strip()},
            ensure_ascii=False,
        )
        if body.specs
        else "",
        "breakdown_json": json.dumps(
            [{"label": line.label.strip(), "amount": round(line.amount, 2)} for line in body.breakdown],
            ensure_ascii=False,
        )
        if body.breakdown
        else "",
    }
    with _lock, _connect() as conn:
        existing = (
            conn.execute(
                "SELECT * FROM showcase_picks WHERE kind = ? AND lot_url = ? ORDER BY id DESC LIMIT 1",
                (body.kind, lot_url),
            ).fetchone()
            if lot_url
            else None
        )
        if existing:
            sets = dict(fields)
            # Пустые значения не затирают то, что уже было сохранено.
            for key in (
                "image_url", "year", "make", "model", "damage", "odometer",
                "images_json", "specs_json", "breakdown_json",
            ):
                if not sets[key]:
                    sets.pop(key)
            if body.on_home is not None:
                sets["on_home"] = int(body.on_home)
            if body.bought is not None:
                sets["bought"] = int(body.bought)
                sets["bought_at"] = now if body.bought else ""
                if body.bought and body.on_home is None:
                    sets["on_home"] = 0
            sets["updated_at"] = now
            cols = ", ".join(f"{key} = ?" for key in sets)
            conn.execute(
                f"UPDATE showcase_picks SET {cols} WHERE id = ?",
                (*sets.values(), existing["id"]),
            )
            pick_id = existing["id"]
        else:
            bought = bool(body.bought)
            on_home = bool(body.on_home) if body.on_home is not None else not bought
            cur = conn.execute(
                """
                INSERT INTO showcase_picks (
                  kind, title, year, make, model, image_url, lot_url, region, source,
                  location, damage, odometer, bid, currency, total_usd, summary,
                  images_json, specs_json, breakdown_json,
                  on_home, bought, bought_at, manager_user_id, manager_name,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    body.kind,
                    fields["title"],
                    fields["year"],
                    fields["make"],
                    fields["model"],
                    fields["image_url"],
                    lot_url,
                    fields["region"],
                    fields["source"],
                    fields["location"],
                    fields["damage"],
                    fields["odometer"],
                    fields["bid"],
                    fields["currency"],
                    fields["total_usd"],
                    fields["summary"],
                    fields["images_json"],
                    fields["specs_json"],
                    fields["breakdown_json"],
                    int(on_home),
                    int(bought),
                    now if bought else "",
                    manager_user_id,
                    manager_name,
                    now,
                    now,
                ),
            )
            pick_id = cur.lastrowid
        conn.commit()
        row = conn.execute("SELECT * FROM showcase_picks WHERE id = ?", (pick_id,)).fetchone()
        return _row(row)


def patch(pick_id: int, body: ShowcasePickPatch) -> dict[str, Any] | None:
    now = _now()
    sets: dict[str, Any] = {}
    if body.on_home is not None:
        sets["on_home"] = int(body.on_home)
    if body.bought is not None:
        sets["bought"] = int(body.bought)
        sets["bought_at"] = now if body.bought else ""
        if body.bought and body.on_home is None:
            sets["on_home"] = 0
    if body.total_usd is not None:
        sets["total_usd"] = body.total_usd
    with _lock, _connect() as conn:
        if sets:
            sets["updated_at"] = now
            cols = ", ".join(f"{key} = ?" for key in sets)
            conn.execute(f"UPDATE showcase_picks SET {cols} WHERE id = ?", (*sets.values(), pick_id))
            conn.commit()
        row = conn.execute("SELECT * FROM showcase_picks WHERE id = ?", (pick_id,)).fetchone()
        return _row(row) if row else None


def delete(pick_id: int) -> bool:
    with _lock, _connect() as conn:
        cur = conn.execute("DELETE FROM showcase_picks WHERE id = ?", (pick_id,))
        conn.commit()
        return cur.rowcount > 0


def list_public(*, section: Literal["home", "bought"], kind: str = "", limit: int = 12) -> list[dict[str, Any]]:
    where = ["on_home = 1", "bought = 0"] if section == "home" else ["bought = 1"]
    params: list[Any] = []
    if kind:
        where.append("kind = ?")
        params.append(kind)
    order = "updated_at DESC" if section == "home" else "bought_at DESC"
    with _lock, _connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM showcase_picks WHERE {' AND '.join(where)} ORDER BY {order} LIMIT ?",
            (*params, limit),
        ).fetchall()
        return [_row(row, public=True) for row in rows]


def get_public(pick_id: int) -> dict[str, Any] | None:
    """Страница машины на сайте: только то, что сейчас на главной или в купленных."""
    with _lock, _connect() as conn:
        row = conn.execute(
            "SELECT * FROM showcase_picks WHERE id = ? AND (on_home = 1 OR bought = 1)", (pick_id,)
        ).fetchone()
        return _row(row, public=True) if row else None


def list_all(*, manager_user_id: int | None = None, limit: int = 200) -> list[dict[str, Any]]:
    with _lock, _connect() as conn:
        if manager_user_id is None:
            rows = conn.execute(
                "SELECT * FROM showcase_picks ORDER BY updated_at DESC LIMIT ?", (limit,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM showcase_picks WHERE manager_user_id = ? ORDER BY updated_at DESC LIMIT ?",
                (manager_user_id, limit),
            ).fetchall()
        return [_row(row) for row in rows]
