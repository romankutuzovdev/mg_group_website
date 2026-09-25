"""SQLite store for cabinet users, deals, stages, media."""

from __future__ import annotations

import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.models.cabinet import (
    LEGACY_STAGE_MAP,
    STAGE_KEYS,
    STAGE_LABELS,
    DealCreate,
    DealKind,
    DealMediaOut,
    DealOut,
    DealStageOut,
    DealStatus,
    DealUpdate,
    DismantleCellOut,
    DismantleCellPatch,
    DismantleMapOut,
    DismantleMetaPatch,
    MediaKind,
    OriginPoint,
    OriginRegion,
    StageKey,
    StageStatus,
    StageUpdate,
    UserOut,
    origin_point_for_kind,
    origin_stage_label,
)
from app.services.cabinet_admin import is_admin_telegram
from app.services.dismantle_map_template import load_dismantle_template


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class CabinetStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._ready = False

    def _path(self) -> Path:
        return Path(get_settings().cabinet_db_path)

    def _uploads(self) -> Path:
        return Path(get_settings().cabinet_uploads_dir)

    def init(self) -> None:
        with self._lock:
            path = self._path()
            path.parent.mkdir(parents=True, exist_ok=True)
            self._uploads().mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(path) as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      telegram_id INTEGER NOT NULL UNIQUE,
                      username TEXT NOT NULL DEFAULT '',
                      first_name TEXT NOT NULL DEFAULT '',
                      last_name TEXT NOT NULL DEFAULT '',
                      photo_url TEXT NOT NULL DEFAULT '',
                      created_at TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS deals (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      user_id INTEGER NOT NULL REFERENCES users(id),
                      title TEXT NOT NULL,
                      vin TEXT NOT NULL DEFAULT '',
                      lot_number TEXT NOT NULL DEFAULT '',
                      status TEXT NOT NULL DEFAULT 'active',
                      note TEXT NOT NULL DEFAULT '',
                      price REAL NOT NULL DEFAULT 0,
                      currency TEXT NOT NULL DEFAULT 'USD',
                      origin_region TEXT NOT NULL DEFAULT 'usa',
                      origin_point TEXT NOT NULL DEFAULT 'dismantle',
                      created_at TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS deal_stages (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
                      stage_key TEXT NOT NULL,
                      status TEXT NOT NULL DEFAULT 'pending',
                      note TEXT NOT NULL DEFAULT '',
                      updated_at TEXT,
                      UNIQUE(deal_id, stage_key)
                    );
                    CREATE TABLE IF NOT EXISTS deal_media (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
                      stage_key TEXT,
                      kind TEXT NOT NULL,
                      path TEXT NOT NULL,
                      filename TEXT NOT NULL DEFAULT '',
                      caption TEXT NOT NULL DEFAULT '',
                      created_at TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS favorites (
                      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                      lot_id TEXT NOT NULL,
                      created_at TEXT NOT NULL,
                      PRIMARY KEY (user_id, lot_id)
                    );
                    CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id);
                    CREATE INDEX IF NOT EXISTS idx_media_deal ON deal_media(deal_id);
                    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
                    """
                )
                self._migrate_schema(conn)
            self._ready = True

    def _migrate_schema(self, conn: sqlite3.Connection) -> None:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(deals)").fetchall()}
        if "origin_region" not in cols:
            conn.execute(
                "ALTER TABLE deals ADD COLUMN origin_region TEXT NOT NULL DEFAULT 'usa'"
            )
        if "origin_point" not in cols:
            conn.execute(
                "ALTER TABLE deals ADD COLUMN origin_point TEXT NOT NULL DEFAULT 'dismantle'"
            )
        if "price" not in cols:
            conn.execute("ALTER TABLE deals ADD COLUMN price REAL NOT NULL DEFAULT 0")
        if "currency" not in cols:
            conn.execute(
                "ALTER TABLE deals ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'"
            )
        if "kind" not in cols:
            conn.execute(
                "ALTER TABLE deals ADD COLUMN kind TEXT NOT NULL DEFAULT 'kit'"
            )
            # Backfill from origin_point: port → whole car, dismantle → kit
            conn.execute(
                "UPDATE deals SET kind = 'car' WHERE origin_point = 'port'"
            )
            conn.execute(
                "UPDATE deals SET kind = 'kit' WHERE origin_point = 'dismantle' OR origin_point IS NULL OR origin_point = ''"
            )
        if "created_by_user_id" not in cols:
            conn.execute(
                "ALTER TABLE deals ADD COLUMN created_by_user_id INTEGER"
            )
        if "payment_stage1_paid" not in cols:
            conn.execute(
                "ALTER TABLE deals ADD COLUMN payment_stage1_paid INTEGER NOT NULL DEFAULT 0"
            )
        if "payment_stage1_at" not in cols:
            conn.execute("ALTER TABLE deals ADD COLUMN payment_stage1_at TEXT")
        if "payment_stage2_paid" not in cols:
            conn.execute(
                "ALTER TABLE deals ADD COLUMN payment_stage2_paid INTEGER NOT NULL DEFAULT 0"
            )
        if "payment_stage2_at" not in cols:
            conn.execute("ALTER TABLE deals ADD COLUMN payment_stage2_at TEXT")
        # Remap legacy stage keys
        for old, new in LEGACY_STAGE_MAP.items():
            conn.execute(
                "UPDATE deal_stages SET stage_key = ? WHERE stage_key = ?",
                (new, old),
            )
        # Ensure all current stages exist for every deal
        for row in conn.execute("SELECT id FROM deals").fetchall():
            self._ensure_stages(conn, int(row[0]))
        # Remap legacy stage_key on media
        for old, new in LEGACY_STAGE_MAP.items():
            conn.execute(
                "UPDATE deal_media SET stage_key = ? WHERE stage_key = ?",
                (new, old),
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS favorites (
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              lot_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              PRIMARY KEY (user_id, lot_id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS deal_dismantle_meta (
              deal_id INTEGER PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
              vehicle_label TEXT NOT NULL DEFAULT '',
              updated_at TEXT,
              completed INTEGER NOT NULL DEFAULT 0,
              completed_at TEXT
            )
            """
        )
        # Migrate older meta tables
        meta_cols = {
            r[1] for r in conn.execute("PRAGMA table_info(deal_dismantle_meta)").fetchall()
        }
        if "completed" not in meta_cols:
            conn.execute(
                "ALTER TABLE deal_dismantle_meta ADD COLUMN completed INTEGER NOT NULL DEFAULT 0"
            )
        if "completed_at" not in meta_cols:
            conn.execute(
                "ALTER TABLE deal_dismantle_meta ADD COLUMN completed_at TEXT"
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS deal_dismantle_cells (
              deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
              item_key TEXT NOT NULL,
              qty TEXT NOT NULL DEFAULT '',
              packing TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              updated_at TEXT,
              PRIMARY KEY (deal_id, item_key)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_dismantle_deal ON deal_dismantle_cells(deal_id)"
        )
        conn.commit()

    def _conn(self) -> sqlite3.Connection:
        if not self._ready:
            self.init()
        conn = sqlite3.connect(self._path())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _user_from_row(self, row: sqlite3.Row) -> UserOut:
        tid = int(row["telegram_id"])
        return UserOut(
            id=int(row["id"]),
            telegram_id=tid,
            username=row["username"] or "",
            first_name=row["first_name"] or "",
            last_name=row["last_name"] or "",
            photo_url=row["photo_url"] or "",
            is_admin=is_admin_telegram(tid),
            created_at=row["created_at"] or "",
        )

    def upsert_user_from_telegram(self, data: dict[str, Any]) -> UserOut:
        with self._lock:
            now = _now()
            with self._conn() as conn:
                existing = conn.execute(
                    "SELECT * FROM users WHERE telegram_id = ?",
                    (int(data["telegram_id"]),),
                ).fetchone()
                if existing:
                    conn.execute(
                        """
                        UPDATE users
                        SET username=?, first_name=?, last_name=?, photo_url=?
                        WHERE telegram_id=?
                        """,
                        (
                            data.get("username") or "",
                            data.get("first_name") or "",
                            data.get("last_name") or "",
                            data.get("photo_url") or "",
                            int(data["telegram_id"]),
                        ),
                    )
                    conn.commit()
                    row = conn.execute(
                        "SELECT * FROM users WHERE telegram_id = ?",
                        (int(data["telegram_id"]),),
                    ).fetchone()
                    return self._user_from_row(row)

                cur = conn.execute(
                    """
                    INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        int(data["telegram_id"]),
                        data.get("username") or "",
                        data.get("first_name") or "",
                        data.get("last_name") or "",
                        data.get("photo_url") or "",
                        now,
                    ),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM users WHERE id = ?",
                    (cur.lastrowid,),
                ).fetchone()
                return self._user_from_row(row)

    def get_user_by_telegram_id(self, telegram_id: int) -> UserOut | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM users WHERE telegram_id = ?",
                    (telegram_id,),
                ).fetchone()
                return self._user_from_row(row) if row else None

    def get_user_by_id(self, user_id: int) -> UserOut | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM users WHERE id = ?",
                    (user_id,),
                ).fetchone()
                return self._user_from_row(row) if row else None

    def _ensure_stages(self, conn: sqlite3.Connection, deal_id: int) -> None:
        for i, key in enumerate(STAGE_KEYS):
            status: StageStatus = "active" if i == 0 else "pending"
            conn.execute(
                """
                INSERT OR IGNORE INTO deal_stages (deal_id, stage_key, status, note, updated_at)
                VALUES (?, ?, ?, '', NULL)
                """,
                (deal_id, key, status),
            )

    def _media_url(self, media_id: int) -> str:
        prefix = get_settings().api_prefix.rstrip("/")
        return f"{prefix}/media/{media_id}"

    def _load_stages(
        self,
        conn: sqlite3.Connection,
        deal_id: int,
        *,
        origin_point: OriginPoint = "dismantle",
    ) -> list[DealStageOut]:
        rows = conn.execute(
            "SELECT * FROM deal_stages WHERE deal_id = ? ORDER BY id",
            (deal_id,),
        ).fetchall()
        by_key = {r["stage_key"]: r for r in rows}
        out: list[DealStageOut] = []
        for key in STAGE_KEYS:
            label = (
                origin_stage_label(origin_point)
                if key == "origin"
                else STAGE_LABELS[key]
            )
            r = by_key.get(key)
            if not r:
                out.append(
                    DealStageOut(
                        key=key,
                        label=label,
                        status="pending",
                        note="",
                        updated_at=None,
                    )
                )
                continue
            out.append(
                DealStageOut(
                    key=key,  # type: ignore[arg-type]
                    label=label,
                    status=r["status"],  # type: ignore[arg-type]
                    note=r["note"] or "",
                    updated_at=r["updated_at"],
                )
            )
        return out

    def _deal_origin(self, row: sqlite3.Row) -> tuple[OriginRegion, OriginPoint]:
        region = row["origin_region"] if "origin_region" in row.keys() else "usa"
        point = row["origin_point"] if "origin_point" in row.keys() else "dismantle"
        if region not in ("usa", "uk", "china", "korea"):
            region = "usa"
        if point not in ("dismantle", "port"):
            point = "dismantle"
        return region, point  # type: ignore[return-value]

    def _deal_kind(self, row: sqlite3.Row) -> DealKind:
        keys = row.keys()
        if "kind" in keys and row["kind"] in ("car", "kit"):
            return row["kind"]  # type: ignore[return-value]
        # Legacy fallback from origin_point
        _, point = self._deal_origin(row)
        return "car" if point == "port" else "kit"

    def _deal_from_row(
        self,
        conn: sqlite3.Connection,
        row: sqlite3.Row,
        *,
        with_details: bool = True,
    ) -> DealOut:
        deal_id = int(row["id"])
        region, point = self._deal_origin(row)
        kind = self._deal_kind(row)
        # Keep point in sync with kind for stage labels / map gating
        point = origin_point_for_kind(kind)
        keys = row.keys()
        price = float(row["price"]) if "price" in keys and row["price"] is not None else 0.0
        currency = row["currency"] if "currency" in keys and row["currency"] else "USD"
        if currency not in ("USD", "GBP"):
            currency = "USD"

        client_tg = 0
        client_name = ""
        client_username = ""
        user_row = conn.execute(
            "SELECT telegram_id, username, first_name, last_name FROM users WHERE id = ?",
            (int(row["user_id"]),),
        ).fetchone()
        if user_row:
            client_tg = int(user_row["telegram_id"] or 0)
            client_username = user_row["username"] or ""
            parts = [user_row["first_name"] or "", user_row["last_name"] or ""]
            client_name = " ".join(p for p in parts if p).strip()

        manager_tg = 0
        created_by = None
        if "created_by_user_id" in keys and row["created_by_user_id"]:
            created_by = int(row["created_by_user_id"])
            mgr = conn.execute(
                "SELECT telegram_id FROM users WHERE id = ?",
                (created_by,),
            ).fetchone()
            if mgr:
                manager_tg = int(mgr["telegram_id"] or 0)

        p1 = bool(int(row["payment_stage1_paid"] or 0)) if "payment_stage1_paid" in keys else False
        p2 = bool(int(row["payment_stage2_paid"] or 0)) if "payment_stage2_paid" in keys else False
        p1_at = (
            str(row["payment_stage1_at"])
            if "payment_stage1_at" in keys and row["payment_stage1_at"]
            else None
        )
        p2_at = (
            str(row["payment_stage2_at"])
            if "payment_stage2_at" in keys and row["payment_stage2_at"]
            else None
        )

        return DealOut(
            id=deal_id,
            title=row["title"],
            vin=row["vin"] or "",
            lot_number=row["lot_number"] or "",
            status=row["status"],  # type: ignore[arg-type]
            note=row["note"] or "",
            price=price,
            currency=currency,  # type: ignore[arg-type]
            kind=kind,
            origin_region=region,
            origin_point=point,
            client_telegram_id=client_tg,
            client_name=client_name,
            client_username=client_username,
            manager_telegram_id=manager_tg,
            payment_stage1_paid=p1,
            payment_stage1_at=p1_at,
            payment_stage2_paid=p2,
            payment_stage2_at=p2_at,
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
            stages=(
                self._load_stages(conn, deal_id, origin_point=point)
                if with_details
                else []
            ),
            media=self._load_media(conn, deal_id) if with_details else [],
        )

    def _load_media(self, conn: sqlite3.Connection, deal_id: int) -> list[DealMediaOut]:
        rows = conn.execute(
            "SELECT * FROM deal_media WHERE deal_id = ? ORDER BY id",
            (deal_id,),
        ).fetchall()
        return [
            DealMediaOut(
                id=int(r["id"]),
                deal_id=deal_id,
                stage_key=r["stage_key"],  # type: ignore[arg-type]
                kind=r["kind"],  # type: ignore[arg-type]
                url=self._media_url(int(r["id"])),
                filename=r["filename"] or "",
                caption=r["caption"] or "",
                created_at=r["created_at"] or "",
            )
            for r in rows
        ]

    def list_deals_for_user(self, user_id: int) -> list[DealOut]:
        with self._lock:
            with self._conn() as conn:
                rows = conn.execute(
                    "SELECT * FROM deals WHERE user_id = ? ORDER BY updated_at DESC",
                    (user_id,),
                ).fetchall()
                return [self._deal_from_row(conn, r, with_details=True) for r in rows]

    def list_all_deals(self) -> list[DealOut]:
        with self._lock:
            with self._conn() as conn:
                rows = conn.execute(
                    "SELECT * FROM deals ORDER BY updated_at DESC"
                ).fetchall()
                return [self._deal_from_row(conn, r, with_details=True) for r in rows]

    def list_users(self) -> list[UserOut]:
        with self._lock:
            with self._conn() as conn:
                rows = conn.execute(
                    "SELECT * FROM users ORDER BY created_at DESC"
                ).fetchall()
                return [self._user_from_row(r) for r in rows]

    def get_deal(self, deal_id: int) -> DealOut | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM deals WHERE id = ?",
                    (deal_id,),
                ).fetchone()
                if not row:
                    return None
                return self._deal_from_row(conn, row, with_details=True)

    def get_deal_owner_id(self, deal_id: int) -> int | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT user_id FROM deals WHERE id = ?",
                    (deal_id,),
                ).fetchone()
                return int(row["user_id"]) if row else None

    def create_deal(
        self,
        data: DealCreate,
        *,
        created_by_user_id: int | None = None,
    ) -> DealOut:
        with self._lock:
            with self._conn() as conn:
                user = conn.execute(
                    "SELECT id FROM users WHERE telegram_id = ?",
                    (data.telegram_id,),
                ).fetchone()
                if not user:
                    raise KeyError("user not found")

                user_id = int(user["id"])
                kind: DealKind = data.kind if data.kind in ("car", "kit") else "kit"
                origin_point = origin_point_for_kind(kind)
                manager_id = int(created_by_user_id) if created_by_user_id else None

                now = _now()
                cur = conn.execute(
                    """
                    INSERT INTO deals (
                      user_id, title, vin, lot_number, status, note,
                      price, currency, kind, origin_region, origin_point,
                      created_by_user_id, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        data.title.strip(),
                        data.vin.strip(),
                        data.lot_number.strip(),
                        data.status,
                        data.note.strip(),
                        float(data.price or 0),
                        data.currency if data.currency in ("USD", "GBP") else "USD",
                        kind,
                        data.origin_region,
                        origin_point,
                        manager_id,
                        now,
                        now,
                    ),
                )
                deal_id = int(cur.lastrowid)
                self._ensure_stages(conn, deal_id)
                conn.commit()
                row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
                return self._deal_from_row(conn, row)

    def get_deal_manager_telegram_id(self, deal_id: int) -> int:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT created_by_user_id FROM deals WHERE id = ?",
                    (deal_id,),
                ).fetchone()
                if not row or not row["created_by_user_id"]:
                    return 0
                mgr = conn.execute(
                    "SELECT telegram_id FROM users WHERE id = ?",
                    (int(row["created_by_user_id"]),),
                ).fetchone()
                return int(mgr["telegram_id"] or 0) if mgr else 0

    def was_dismantle_completed(self, deal_id: int) -> bool:
        with self._lock:
            with self._conn() as conn:
                meta = conn.execute(
                    "SELECT completed FROM deal_dismantle_meta WHERE deal_id = ?",
                    (deal_id,),
                ).fetchone()
                if meta is None or "completed" not in meta.keys():
                    return False
                return bool(int(meta["completed"] or 0))

    def update_deal(self, deal_id: int, data: DealUpdate) -> DealOut | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
                if not row:
                    return None
                fields: dict[str, Any] = {}
                if data.title is not None:
                    fields["title"] = data.title.strip()
                if data.vin is not None:
                    fields["vin"] = data.vin.strip()
                if data.lot_number is not None:
                    fields["lot_number"] = data.lot_number.strip()
                if data.note is not None:
                    fields["note"] = data.note.strip()
                if data.price is not None:
                    fields["price"] = float(data.price)
                if data.currency is not None:
                    fields["currency"] = data.currency if data.currency in ("USD", "GBP") else "USD"
                if data.status is not None:
                    fields["status"] = data.status
                if data.origin_region is not None:
                    fields["origin_region"] = data.origin_region
                if data.kind is not None:
                    kind: DealKind = data.kind if data.kind in ("car", "kit") else "kit"
                    fields["kind"] = kind
                    fields["origin_point"] = origin_point_for_kind(kind)
                elif data.origin_point is not None:
                    fields["origin_point"] = data.origin_point
                    fields["kind"] = "car" if data.origin_point == "port" else "kit"
                if fields:
                    fields["updated_at"] = _now()
                    sets = ", ".join(f"{k}=?" for k in fields)
                    conn.execute(
                        f"UPDATE deals SET {sets} WHERE id = ?",
                        (*fields.values(), deal_id),
                    )
                    conn.commit()
                row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
                return self._deal_from_row(conn, row)

    def update_payment_stage(
        self,
        deal_id: int,
        *,
        stage: int,
        paid: bool,
    ) -> DealOut | None:
        if stage not in (1, 2):
            raise ValueError("stage must be 1 or 2")
        with self._lock:
            with self._conn() as conn:
                row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
                if not row:
                    return None
                now = _now()
                paid_col = f"payment_stage{stage}_paid"
                at_col = f"payment_stage{stage}_at"
                # Stage 2 can only be closed if stage 1 is already paid (or closing both via reopen)
                if stage == 2 and paid:
                    p1 = 0
                    if "payment_stage1_paid" in row.keys():
                        p1 = int(row["payment_stage1_paid"] or 0)
                    if not p1:
                        raise ValueError("Сначала закройте этап 1 оплаты")
                # Reopening stage 1 also reopens stage 2
                if stage == 1 and not paid:
                    conn.execute(
                        """
                        UPDATE deals SET
                          payment_stage1_paid = 0,
                          payment_stage1_at = NULL,
                          payment_stage2_paid = 0,
                          payment_stage2_at = NULL,
                          updated_at = ?
                        WHERE id = ?
                        """,
                        (now, deal_id),
                    )
                else:
                    conn.execute(
                        f"""
                        UPDATE deals SET
                          {paid_col} = ?,
                          {at_col} = ?,
                          updated_at = ?
                        WHERE id = ?
                        """,
                        (1 if paid else 0, now if paid else None, now, deal_id),
                    )
                conn.commit()
                row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
                return self._deal_from_row(conn, row)

    def update_stage(
        self,
        deal_id: int,
        stage_key: StageKey,
        data: StageUpdate,
    ) -> DealOut | None:
        # Accept legacy keys from old clients
        # (existing method continues below)
        key: StageKey = LEGACY_STAGE_MAP.get(stage_key, stage_key)  # type: ignore[arg-type]
        if key not in STAGE_KEYS:
            return None
        with self._lock:
            with self._conn() as conn:
                row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
                if not row:
                    return None
                self._ensure_stages(conn, deal_id)
                now = _now()
                # When marking a stage active, demote other actives to pending
                # (done stays done) so the map has a single "current" pin.
                if data.status == "active":
                    conn.execute(
                        """
                        UPDATE deal_stages
                        SET status = 'pending'
                        WHERE deal_id = ? AND status = 'active' AND stage_key != ?
                        """,
                        (deal_id, key),
                    )
                conn.execute(
                    """
                    UPDATE deal_stages
                    SET status = ?, note = ?, updated_at = ?
                    WHERE deal_id = ? AND stage_key = ?
                    """,
                    (data.status, data.note.strip(), now, deal_id, key),
                )
                # After "done", auto-activate the next stage so the route keeps moving.
                if data.status == "done":
                    try:
                        idx = STAGE_KEYS.index(key)
                    except ValueError:
                        idx = -1
                    if 0 <= idx < len(STAGE_KEYS) - 1:
                        nxt = STAGE_KEYS[idx + 1]
                        conn.execute(
                            """
                            UPDATE deal_stages
                            SET status = 'pending'
                            WHERE deal_id = ? AND status = 'active' AND stage_key != ?
                            """,
                            (deal_id, nxt),
                        )
                        conn.execute(
                            """
                            UPDATE deal_stages
                            SET status = 'active', updated_at = ?
                            WHERE deal_id = ? AND stage_key = ? AND status != 'done'
                            """,
                            (now, deal_id, nxt),
                        )
                    else:
                        # Last stage done → deal completed
                        conn.execute(
                            "UPDATE deals SET status = 'completed', updated_at = ? WHERE id = ?",
                            (now, deal_id),
                        )
                conn.execute(
                    "UPDATE deals SET updated_at = ? WHERE id = ?",
                    (now, deal_id),
                )
                conn.commit()
                row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
                return self._deal_from_row(conn, row)

    def add_media(
        self,
        *,
        deal_id: int,
        kind: MediaKind,
        content: bytes,
        filename: str,
        stage_key: StageKey | None = None,
        caption: str = "",
        content_type: str = "",
    ) -> DealMediaOut:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute("SELECT id FROM deals WHERE id = ?", (deal_id,)).fetchone()
                if not row:
                    raise KeyError("deal not found")

                uploads = self._uploads()
                uploads.mkdir(parents=True, exist_ok=True)
                safe_name = Path(filename or "file").name
                ext = Path(safe_name).suffix[:16]
                stored = f"{deal_id}_{uuid.uuid4().hex}{ext}"
                dest = uploads / stored
                dest.write_bytes(content)

                now = _now()
                cur = conn.execute(
                    """
                    INSERT INTO deal_media (deal_id, stage_key, kind, path, filename, caption, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        deal_id,
                        stage_key,
                        kind,
                        stored,
                        safe_name,
                        caption.strip(),
                        now,
                    ),
                )
                conn.execute(
                    "UPDATE deals SET updated_at = ? WHERE id = ?",
                    (now, deal_id),
                )
                conn.commit()
                media_id = int(cur.lastrowid)
                return DealMediaOut(
                    id=media_id,
                    deal_id=deal_id,
                    stage_key=stage_key,
                    kind=kind,
                    url=self._media_url(media_id),
                    filename=safe_name,
                    caption=caption.strip(),
                    created_at=now,
                )

    def get_media_file(self, media_id: int) -> tuple[Path, str, str] | None:
        """Return (path, filename, kind) or None."""
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM deal_media WHERE id = ?",
                    (media_id,),
                ).fetchone()
                if not row:
                    return None
                path = self._uploads() / row["path"]
                if not path.is_file():
                    return None
                return path, row["filename"] or path.name, row["kind"] or "document"

    def media_belongs_to_user(self, media_id: int, user_id: int) -> bool:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    """
                    SELECT d.user_id AS user_id
                    FROM deal_media m
                    JOIN deals d ON d.id = m.deal_id
                    WHERE m.id = ?
                    """,
                    (media_id,),
                ).fetchone()
                return bool(row) and int(row["user_id"]) == user_id

    def list_favorite_ids(self, user_id: int) -> list[tuple[str, str]]:
        """Return [(lot_id, created_at), ...] newest first."""
        with self._lock:
            with self._conn() as conn:
                rows = conn.execute(
                    """
                    SELECT lot_id, created_at FROM favorites
                    WHERE user_id = ?
                    ORDER BY created_at DESC
                    """,
                    (user_id,),
                ).fetchall()
                return [(str(r["lot_id"]), r["created_at"] or "") for r in rows]

    def is_favorite(self, user_id: int, lot_id: str) -> bool:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT 1 FROM favorites WHERE user_id = ? AND lot_id = ?",
                    (user_id, lot_id),
                ).fetchone()
                return bool(row)

    def add_favorite(self, user_id: int, lot_id: str) -> bool:
        """Returns True if newly added, False if already existed."""
        with self._lock:
            with self._conn() as conn:
                existing = conn.execute(
                    "SELECT 1 FROM favorites WHERE user_id = ? AND lot_id = ?",
                    (user_id, lot_id),
                ).fetchone()
                if existing:
                    return False
                conn.execute(
                    "INSERT INTO favorites (user_id, lot_id, created_at) VALUES (?, ?, ?)",
                    (user_id, lot_id, _now()),
                )
                conn.commit()
                return True

    def remove_favorite(self, user_id: int, lot_id: str) -> bool:
        with self._lock:
            with self._conn() as conn:
                cur = conn.execute(
                    "DELETE FROM favorites WHERE user_id = ? AND lot_id = ?",
                    (user_id, lot_id),
                )
                conn.commit()
                return cur.rowcount > 0

    def get_dismantle_map(self, deal_id: int) -> DismantleMapOut | None:
        deal = self.get_deal(deal_id)
        if not deal:
            return None
        template = load_dismantle_template()
        with self._lock:
            with self._conn() as conn:
                meta = conn.execute(
                    "SELECT * FROM deal_dismantle_meta WHERE deal_id = ?",
                    (deal_id,),
                ).fetchone()
                saved = {
                    str(r["item_key"]): r
                    for r in conn.execute(
                        "SELECT item_key, qty, packing, note, updated_at "
                        "FROM deal_dismantle_cells WHERE deal_id = ?",
                        (deal_id,),
                    ).fetchall()
                }

        # Always show deal identity; optional meta.vehicle_label only if explicitly set
        # and different (legacy). Prefer deal title + lot so the make cannot "drift".
        parts: list[str] = []
        if deal.title.strip():
            parts.append(deal.title.strip())
        lot = (deal.lot_number or "").strip()
        if lot and f"Lot#{lot}" not in (deal.title or "") and lot not in (deal.title or ""):
            parts.append(f"Lot#{lot}")
        default_label = " ".join(parts).strip()
        saved_label = (meta["vehicle_label"] if meta else "") or ""
        # Ignore empty / whitespace meta — never let an empty save wipe the deal label
        vehicle_label = saved_label.strip() or default_label
        latest = meta["updated_at"] if meta else None
        for row in saved.values():
            ts = row["updated_at"]
            if ts and (latest is None or ts > latest):
                latest = ts

        completed = False
        completed_at: str | None = None
        if meta is not None:
            keys = meta.keys()
            if "completed" in keys:
                completed = bool(int(meta["completed"] or 0))
            if "completed_at" in keys and meta["completed_at"]:
                completed_at = str(meta["completed_at"])

        cells: list[DismantleCellOut] = []
        for item in template.get("items") or []:
            key = str(item.get("key") or "")
            if not key:
                continue
            row = saved.get(key)
            cells.append(
                DismantleCellOut(
                    key=key,
                    num=item.get("num"),
                    section=str(item.get("section") or ""),
                    name=str(item.get("name") or ""),
                    qty=str(row["qty"]) if row is not None else str(item.get("defaultQty") or ""),
                    packing=str(row["packing"]) if row is not None else str(item.get("defaultPack") or ""),
                    note=str(row["note"]) if row is not None else str(item.get("defaultNote") or ""),
                    is_note_only=bool(item.get("isNoteOnly")),
                )
            )

        return DismantleMapOut(
            deal_id=deal_id,
            title=str(template.get("title") or "Карта разбора"),
            vehicle_label=vehicle_label,
            vehicle_header_hint=str(template.get("vehicleHeaderHint") or ""),
            sections=list(template.get("sections") or []),
            cells=cells,
            updated_at=latest,
            completed=completed,
            completed_at=completed_at,
        )

    def patch_dismantle_meta(self, deal_id: int, data: DismantleMetaPatch) -> DismantleMapOut:
        if self.get_deal(deal_id) is None:
            raise KeyError("deal not found")
        now = _now()
        with self._lock:
            with self._conn() as conn:
                existing = conn.execute(
                    "SELECT * FROM deal_dismantle_meta WHERE deal_id = ?",
                    (deal_id,),
                ).fetchone()
                vehicle_label = (
                    data.vehicle_label.strip()
                    if data.vehicle_label is not None
                    else ((existing["vehicle_label"] if existing else "") or "")
                )
                completed = int(existing["completed"] or 0) if existing and "completed" in existing.keys() else 0
                completed_at = (
                    existing["completed_at"]
                    if existing and "completed_at" in existing.keys()
                    else None
                )
                if data.completed is not None:
                    completed = 1 if data.completed else 0
                    completed_at = now if data.completed else None

                conn.execute(
                    """
                    INSERT INTO deal_dismantle_meta
                      (deal_id, vehicle_label, updated_at, completed, completed_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(deal_id) DO UPDATE SET
                      vehicle_label = excluded.vehicle_label,
                      updated_at = excluded.updated_at,
                      completed = excluded.completed,
                      completed_at = excluded.completed_at
                    """,
                    (deal_id, vehicle_label, now, completed, completed_at),
                )
                conn.execute(
                    "UPDATE deals SET updated_at = ? WHERE id = ?",
                    (now, deal_id),
                )
                conn.commit()
        out = self.get_dismantle_map(deal_id)
        assert out is not None
        return out

    def patch_dismantle_cell(
        self, deal_id: int, item_key: str, data: DismantleCellPatch
    ) -> DismantleCellOut:
        if self.get_deal(deal_id) is None:
            raise KeyError("deal not found")
        # Block edits when map is marked completed
        with self._lock:
            with self._conn() as conn:
                meta = conn.execute(
                    "SELECT completed FROM deal_dismantle_meta WHERE deal_id = ?",
                    (deal_id,),
                ).fetchone()
                if meta is not None and "completed" in meta.keys() and int(meta["completed"] or 0):
                    raise ValueError("map completed")
        # continue with existing cell patch logic below — need to not duplicate method
        return self._patch_dismantle_cell_inner(deal_id, item_key, data)

    def _patch_dismantle_cell_inner(
        self, deal_id: int, item_key: str, data: DismantleCellPatch
    ) -> DismantleCellOut:
        if self.get_deal(deal_id) is None:
            raise KeyError("deal not found")
        key = (item_key or "").strip()
        if not key:
            raise ValueError("item_key required")

        template = load_dismantle_template()
        item = next((i for i in (template.get("items") or []) if str(i.get("key")) == key), None)
        if item is None:
            raise KeyError("item not found")

        now = _now()
        with self._lock:
            with self._conn() as conn:
                existing = conn.execute(
                    "SELECT qty, packing, note FROM deal_dismantle_cells "
                    "WHERE deal_id = ? AND item_key = ?",
                    (deal_id, key),
                ).fetchone()
                qty = (
                    data.qty
                    if data.qty is not None
                    else (existing["qty"] if existing else str(item.get("defaultQty") or ""))
                )
                packing = (
                    data.packing
                    if data.packing is not None
                    else (existing["packing"] if existing else str(item.get("defaultPack") or ""))
                )
                note = (
                    data.note
                    if data.note is not None
                    else (existing["note"] if existing else str(item.get("defaultNote") or ""))
                )
                conn.execute(
                    """
                    INSERT INTO deal_dismantle_cells (deal_id, item_key, qty, packing, note, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(deal_id, item_key) DO UPDATE SET
                      qty = excluded.qty,
                      packing = excluded.packing,
                      note = excluded.note,
                      updated_at = excluded.updated_at
                    """,
                    (deal_id, key, str(qty), str(packing), str(note), now),
                )
                # Touch meta timestamp only — never blank out vehicle_label on cell edits
                conn.execute(
                    """
                    INSERT INTO deal_dismantle_meta (deal_id, vehicle_label, updated_at)
                    VALUES (?, '', ?)
                    ON CONFLICT(deal_id) DO UPDATE SET
                      updated_at = excluded.updated_at
                    """,
                    (deal_id, now),
                )
                conn.execute(
                    "UPDATE deals SET updated_at = ? WHERE id = ?",
                    (now, deal_id),
                )
                conn.commit()

        return DismantleCellOut(
            key=key,
            num=item.get("num"),
            section=str(item.get("section") or ""),
            name=str(item.get("name") or ""),
            qty=str(qty),
            packing=str(packing),
            note=str(note),
            is_note_only=bool(item.get("isNoteOnly")),
        )


cabinet_store = CabinetStore()
