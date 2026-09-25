"""Manager-curated showcase of purchased whole cars (not kits)."""

from __future__ import annotations

import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel

from app.config import get_settings

RegionLabel = Literal["США", "Англия"]
Currency = Literal["USD", "GBP"]


class PurchasedCarCreate(BaseModel):
    year: int
    make: str
    model: str
    trim: str = ""
    image_url: str = ""
    source: str = "Copart"
    region: RegionLabel = "США"
    purchased_at: str = ""
    damage: str = ""
    odometer: str = ""
    auction_price: float = 0
    delivery: float = 0
    dismantle: float = 0
    delivery_and_fees: float | None = None
    total_cost: float | None = None
    market_by: float = 0
    currency: Currency = "USD"
    href: str = ""
    note: str = ""
    published: bool = True


class PurchasedCarUpdate(BaseModel):
    year: int | None = None
    make: str | None = None
    model: str | None = None
    trim: str | None = None
    image_url: str | None = None
    source: str | None = None
    region: RegionLabel | None = None
    purchased_at: str | None = None
    damage: str | None = None
    odometer: str | None = None
    auction_price: float | None = None
    delivery: float | None = None
    dismantle: float | None = None
    delivery_and_fees: float | None = None
    total_cost: float | None = None
    market_by: float | None = None
    currency: Currency | None = None
    href: str | None = None
    note: str | None = None
    published: bool | None = None


class PurchasedCarOut(BaseModel):
    id: str
    year: int
    make: str
    model: str
    trim: str = ""
    image: str
    source: str
    region: RegionLabel
    purchasedAt: str = ""
    damage: str = ""
    odometer: str = ""
    auctionPrice: float = 0
    delivery: float = 0
    dismantle: float = 0
    deliveryAndFees: float = 0
    totalCost: float = 0
    marketBy: float = 0
    currency: Currency = "USD"
    href: str | None = None
    note: str = ""
    published: bool = True
    createdAt: str = ""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PurchasedCarsStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._ready = False

    def _db_path(self) -> Path:
        # Share cabinet db file for simplicity
        return Path(get_settings().cabinet_db_path)

    def _uploads(self) -> Path:
        return Path(get_settings().cabinet_uploads_dir) / "purchased-cars"

    def init(self) -> None:
        with self._lock:
            path = self._db_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            self._uploads().mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(path) as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS purchased_cars (
                      id TEXT PRIMARY KEY,
                      year INTEGER NOT NULL,
                      make TEXT NOT NULL,
                      model TEXT NOT NULL,
                      trim TEXT NOT NULL DEFAULT '',
                      image_path TEXT NOT NULL DEFAULT '',
                      source TEXT NOT NULL DEFAULT 'Copart',
                      region TEXT NOT NULL DEFAULT 'США',
                      purchased_at TEXT NOT NULL DEFAULT '',
                      damage TEXT NOT NULL DEFAULT '',
                      odometer TEXT NOT NULL DEFAULT '',
                      auction_price REAL NOT NULL DEFAULT 0,
                      delivery REAL NOT NULL DEFAULT 0,
                      dismantle REAL NOT NULL DEFAULT 0,
                      delivery_and_fees REAL NOT NULL DEFAULT 0,
                      total_cost REAL NOT NULL DEFAULT 0,
                      market_by REAL NOT NULL DEFAULT 0,
                      currency TEXT NOT NULL DEFAULT 'USD',
                      href TEXT NOT NULL DEFAULT '',
                      note TEXT NOT NULL DEFAULT '',
                      published INTEGER NOT NULL DEFAULT 1,
                      created_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_purchased_cars_pub
                      ON purchased_cars(published, created_at DESC);
                    """
                )
            self._ready = True

    def _conn(self) -> sqlite3.Connection:
        if not self._ready:
            self.init()
        conn = sqlite3.connect(self._db_path())
        conn.row_factory = sqlite3.Row
        return conn

    def _image_url(self, car_id: str, image_path: str) -> str:
        if image_path.startswith("http://") or image_path.startswith("https://"):
            return image_path
        if not image_path:
            return ""
        prefix = get_settings().api_prefix.rstrip("/")
        return f"{prefix}/purchased-cars/{car_id}/image"

    def _row_to_out(self, row: sqlite3.Row) -> PurchasedCarOut:
        car_id = row["id"]
        delivery = float(row["delivery"] or 0)
        dismantle = float(row["dismantle"] or 0)
        delivery_and_fees = float(row["delivery_and_fees"] or 0)
        if delivery_and_fees <= 0:
            delivery_and_fees = delivery + dismantle
        total = float(row["total_cost"] or 0)
        if total <= 0:
            total = float(row["auction_price"] or 0) + delivery_and_fees
        href = (row["href"] or "").strip() or None
        return PurchasedCarOut(
            id=car_id,
            year=int(row["year"]),
            make=row["make"],
            model=row["model"],
            trim=row["trim"] or "",
            image=self._image_url(car_id, row["image_path"] or ""),
            source=row["source"] or "Copart",
            region=row["region"] or "США",  # type: ignore[arg-type]
            purchasedAt=row["purchased_at"] or "",
            damage=row["damage"] or "",
            odometer=row["odometer"] or "",
            auctionPrice=float(row["auction_price"] or 0),
            delivery=delivery,
            dismantle=dismantle,
            deliveryAndFees=delivery_and_fees,
            totalCost=total,
            marketBy=float(row["market_by"] or 0),
            currency=row["currency"] or "USD",  # type: ignore[arg-type]
            href=href,
            note=row["note"] or "",
            published=bool(row["published"]),
            createdAt=row["created_at"] or "",
        )

    def list_public(self, limit: int = 50) -> list[PurchasedCarOut]:
        with self._lock:
            with self._conn() as conn:
                rows = conn.execute(
                    """
                    SELECT * FROM purchased_cars
                    WHERE published = 1
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                return [self._row_to_out(r) for r in rows]

    def list_all(self, limit: int = 100) -> list[PurchasedCarOut]:
        with self._lock:
            with self._conn() as conn:
                rows = conn.execute(
                    """
                    SELECT * FROM purchased_cars
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                return [self._row_to_out(r) for r in rows]

    def get(self, car_id: str) -> PurchasedCarOut | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM purchased_cars WHERE id = ?",
                    (car_id,),
                ).fetchone()
                return self._row_to_out(row) if row else None

    def create(self, data: PurchasedCarCreate) -> PurchasedCarOut:
        with self._lock:
            car_id = f"pc-{uuid.uuid4().hex[:12]}"
            delivery_and_fees = data.delivery_and_fees
            if delivery_and_fees is None:
                delivery_and_fees = data.delivery + data.dismantle
            total = data.total_cost
            if total is None:
                total = data.auction_price + delivery_and_fees
            now = _now()
            with self._conn() as conn:
                conn.execute(
                    """
                    INSERT INTO purchased_cars (
                      id, year, make, model, trim, image_path, source, region,
                      purchased_at, damage, odometer, auction_price, delivery,
                      dismantle, delivery_and_fees, total_cost, market_by,
                      currency, href, note, published, created_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        car_id,
                        data.year,
                        data.make.strip(),
                        data.model.strip(),
                        data.trim.strip(),
                        data.image_url.strip(),
                        data.source.strip() or "Copart",
                        data.region,
                        data.purchased_at.strip(),
                        data.damage.strip(),
                        data.odometer.strip(),
                        data.auction_price,
                        data.delivery,
                        data.dismantle,
                        delivery_and_fees,
                        total,
                        data.market_by,
                        data.currency,
                        data.href.strip(),
                        data.note.strip(),
                        1 if data.published else 0,
                        now,
                    ),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM purchased_cars WHERE id = ?",
                    (car_id,),
                ).fetchone()
                return self._row_to_out(row)

    def update(self, car_id: str, data: PurchasedCarUpdate) -> PurchasedCarOut | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM purchased_cars WHERE id = ?",
                    (car_id,),
                ).fetchone()
                if not row:
                    return None
                fields: dict[str, Any] = {}
                mapping = {
                    "year": data.year,
                    "make": data.make.strip() if data.make is not None else None,
                    "model": data.model.strip() if data.model is not None else None,
                    "trim": data.trim.strip() if data.trim is not None else None,
                    "image_path": data.image_url.strip() if data.image_url is not None else None,
                    "source": data.source.strip() if data.source is not None else None,
                    "region": data.region,
                    "purchased_at": data.purchased_at.strip() if data.purchased_at is not None else None,
                    "damage": data.damage.strip() if data.damage is not None else None,
                    "odometer": data.odometer.strip() if data.odometer is not None else None,
                    "auction_price": data.auction_price,
                    "delivery": data.delivery,
                    "dismantle": data.dismantle,
                    "delivery_and_fees": data.delivery_and_fees,
                    "total_cost": data.total_cost,
                    "market_by": data.market_by,
                    "currency": data.currency,
                    "href": data.href.strip() if data.href is not None else None,
                    "note": data.note.strip() if data.note is not None else None,
                }
                for key, value in mapping.items():
                    if value is not None:
                        fields[key] = value
                if data.published is not None:
                    fields["published"] = 1 if data.published else 0
                if fields:
                    sets = ", ".join(f"{k}=?" for k in fields)
                    conn.execute(
                        f"UPDATE purchased_cars SET {sets} WHERE id = ?",
                        (*fields.values(), car_id),
                    )
                    conn.commit()
                row = conn.execute(
                    "SELECT * FROM purchased_cars WHERE id = ?",
                    (car_id,),
                ).fetchone()
                return self._row_to_out(row)

    def delete(self, car_id: str) -> bool:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT image_path FROM purchased_cars WHERE id = ?",
                    (car_id,),
                ).fetchone()
                if not row:
                    return False
                image_path = row["image_path"] or ""
                conn.execute("DELETE FROM purchased_cars WHERE id = ?", (car_id,))
                conn.commit()
            if image_path and not image_path.startswith("http"):
                path = self._uploads() / image_path
                if path.is_file():
                    path.unlink(missing_ok=True)
            return True

    def set_image(
        self,
        car_id: str,
        *,
        content: bytes,
        filename: str,
    ) -> PurchasedCarOut | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT id FROM purchased_cars WHERE id = ?",
                    (car_id,),
                ).fetchone()
                if not row:
                    return None
                uploads = self._uploads()
                uploads.mkdir(parents=True, exist_ok=True)
                ext = Path(filename or "photo.jpg").suffix[:16] or ".jpg"
                stored = f"{car_id}_{uuid.uuid4().hex[:8]}{ext}"
                (uploads / stored).write_bytes(content)
                conn.execute(
                    "UPDATE purchased_cars SET image_path = ? WHERE id = ?",
                    (stored, car_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM purchased_cars WHERE id = ?",
                    (car_id,),
                ).fetchone()
                return self._row_to_out(row)

    def get_image_file(self, car_id: str) -> tuple[Path, str] | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT image_path FROM purchased_cars WHERE id = ?",
                    (car_id,),
                ).fetchone()
                if not row:
                    return None
                image_path = row["image_path"] or ""
                if not image_path or image_path.startswith("http"):
                    return None
                path = self._uploads() / image_path
                if not path.is_file():
                    return None
                return path, path.name


purchased_cars_store = PurchasedCarsStore()
