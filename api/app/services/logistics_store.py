"""SQLite store for shipping containers and SMS templates (same DB as cabinet)."""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.models.cabinet import DealKind, DealStatus, OriginRegion
from app.models.logistics import (
    CONTAINER_STAGE_LABELS,
    CONTAINER_STAGES,
    ContainerOut,
    ContainerStage,
    LogisticsDealCard,
    SmsTemplateOut,
    container_stage_label,
)

_DEFAULT_TEMPLATES: list[tuple[str, str]] = [
    (
        "Загрузка в контейнер",
        "MG.GROUP: ваш авто {car} загружен в контейнер {container}. Этап: {stage}.",
    ),
    (
        "Вышел в путь",
        "MG.GROUP: контейнер {container} с вашим авто {car} вышел в путь. Этап: {stage}.",
    ),
    (
        "В море",
        "MG.GROUP: контейнер {container} с вашим авто {car} в море. Этап: {stage}.",
    ),
    (
        "Таможня",
        "MG.GROUP: контейнер {container} с вашим авто {car} на таможне. Этап: {stage}.",
    ),
    (
        "Прибыл в РБ",
        "MG.GROUP: контейнер {container} с вашим авто {car} прибыл в Беларусь. Этап: {stage}.",
    ),
    (
        "Разгрузка / выдача",
        "MG.GROUP: контейнер {container} на этапе «{stage}». Авто: {car}. Свяжитесь с менеджером при необходимости.",
    ),
]


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class LogisticsStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._ready = False

    def _path(self) -> Path:
        return Path(get_settings().cabinet_db_path)

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._path()), timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 30000")
        try:
            conn.execute("PRAGMA journal_mode = WAL")
        except sqlite3.Error:
            pass
        return conn

    def init(self) -> None:
        with self._lock:
            path = self._path()
            path.parent.mkdir(parents=True, exist_ok=True)
            with self._conn() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS shipping_containers (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      code TEXT NOT NULL,
                      title TEXT NOT NULL DEFAULT '',
                      stage TEXT NOT NULL DEFAULT 'loading',
                      note TEXT NOT NULL DEFAULT '',
                      created_at TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS container_items (
                      container_id INTEGER NOT NULL
                        REFERENCES shipping_containers(id) ON DELETE CASCADE,
                      deal_id INTEGER NOT NULL UNIQUE
                        REFERENCES deals(id) ON DELETE CASCADE,
                      added_at TEXT NOT NULL,
                      PRIMARY KEY (container_id, deal_id)
                    );
                    CREATE TABLE IF NOT EXISTS sms_templates (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      title TEXT NOT NULL,
                      body TEXT NOT NULL,
                      kind TEXT NOT NULL DEFAULT 'container_stage',
                      created_at TEXT NOT NULL,
                      updated_at TEXT NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_container_items_deal
                      ON container_items(deal_id);
                    """
                )
                self._seed_templates(conn)
                conn.commit()
            self._ready = True

    def _seed_templates(self, conn: sqlite3.Connection) -> None:
        count = conn.execute("SELECT COUNT(*) AS c FROM sms_templates").fetchone()["c"]
        if int(count) > 0:
            return
        now = _now()
        for title, body in _DEFAULT_TEMPLATES:
            conn.execute(
                """
                INSERT INTO sms_templates (title, body, kind, created_at, updated_at)
                VALUES (?, ?, 'container_stage', ?, ?)
                """,
                (title, body, now, now),
            )

    def _deal_card(
        self,
        conn: sqlite3.Connection,
        row: sqlite3.Row,
        *,
        container_id: int | None,
    ) -> LogisticsDealCard:
        keys = row.keys()
        user_id = int(row["user_id"])
        client = conn.execute(
            "SELECT first_name, last_name, phone, username FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        client_name = ""
        client_phone = ""
        if client:
            client_name = " ".join(
                p for p in (client["first_name"] or "", client["last_name"] or "") if p
            ).strip()
            if not client_name and client["username"]:
                client_name = str(client["username"])
            client_phone = str(client["phone"] or "")
        kind: DealKind = "kit"
        if "kind" in keys and row["kind"] in ("car", "kit"):
            kind = row["kind"]  # type: ignore[assignment]
        region: OriginRegion = "usa"
        if "origin_region" in keys and row["origin_region"] in ("usa", "uk", "china", "korea"):
            region = row["origin_region"]  # type: ignore[assignment]
        status: DealStatus = "active"
        if row["status"] in ("active", "completed", "cancelled"):
            status = row["status"]  # type: ignore[assignment]
        cover_url = ""
        media_rows = conn.execute(
            """
            SELECT id, path FROM deal_media
            WHERE deal_id = ? AND kind = 'photo'
            ORDER BY id ASC
            """,
            (int(row["id"]),),
        ).fetchall()
        if media_rows:
            from app.config import get_settings

            uploads = Path(get_settings().cabinet_uploads_dir)
            prefix = get_settings().api_prefix.rstrip("/")
            for media in media_rows:
                rel = str(media["path"] or "").strip()
                if rel and (uploads / rel).is_file():
                    cover_url = f"{prefix}/media/{int(media['id'])}"
                    break

        engine = ""
        damage = ""
        if "specs_json" in keys and row["specs_json"]:
            try:
                import json

                raw = json.loads(str(row["specs_json"] or "{}"))
                if isinstance(raw, dict):
                    engine = str(raw.get("engine") or "")
                    damage = str(raw.get("primary_damage") or "")
            except Exception:
                pass

        return LogisticsDealCard(
            deal_id=int(row["id"]),
            title=row["title"] or f"Сделка #{row['id']}",
            vin=row["vin"] or "",
            lot_number=row["lot_number"] or "",
            kind=kind,
            origin_region=region,
            status=status,
            client_name=client_name,
            client_phone=client_phone,
            container_id=container_id,
            cover_url=cover_url,
            engine=engine,
            primary_damage=damage,
        )

    def _container_from_row(
        self, conn: sqlite3.Connection, row: sqlite3.Row
    ) -> ContainerOut:
        cid = int(row["id"])
        stage = row["stage"] if row["stage"] in CONTAINER_STAGES else "loading"
        deal_rows = conn.execute(
            """
            SELECT d.* FROM deals d
            INNER JOIN container_items ci ON ci.deal_id = d.id
            WHERE ci.container_id = ?
            ORDER BY ci.added_at ASC, d.id ASC
            """,
            (cid,),
        ).fetchall()
        deals = [self._deal_card(conn, r, container_id=cid) for r in deal_rows]
        return ContainerOut(
            id=cid,
            code=row["code"] or f"CNT-{cid}",
            title=row["title"] or "",
            stage=stage,  # type: ignore[arg-type]
            stage_label=container_stage_label(stage),
            note=row["note"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
            deals=deals,
        )

    def list_pool(self) -> list[LogisticsDealCard]:
        with self._lock:
            with self._conn() as conn:
                rows = conn.execute(
                    """
                    SELECT d.* FROM deals d
                    LEFT JOIN container_items ci ON ci.deal_id = d.id
                    WHERE ci.deal_id IS NULL
                      AND d.status = 'active'
                    ORDER BY d.updated_at DESC
                    """
                ).fetchall()
                return [self._deal_card(conn, r, container_id=None) for r in rows]

    def list_containers(self) -> list[ContainerOut]:
        with self._lock:
            with self._conn() as conn:
                rows = conn.execute(
                    """
                    SELECT * FROM shipping_containers
                    ORDER BY
                      CASE stage
                        WHEN 'loading' THEN 1
                        WHEN 'departed' THEN 2
                        WHEN 'ocean' THEN 3
                        WHEN 'customs' THEN 4
                        WHEN 'arrived' THEN 5
                        WHEN 'unloading' THEN 6
                        WHEN 'done' THEN 7
                        ELSE 8
                      END,
                      updated_at DESC
                    """
                ).fetchall()
                return [self._container_from_row(conn, r) for r in rows]

    def get_container(self, container_id: int) -> ContainerOut | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM shipping_containers WHERE id = ?",
                    (int(container_id),),
                ).fetchone()
                if not row:
                    return None
                return self._container_from_row(conn, row)

    def create_container(
        self,
        *,
        code: str,
        title: str = "",
        stage: ContainerStage = "loading",
        note: str = "",
    ) -> ContainerOut:
        code_clean = (code or "").strip()
        if not code_clean:
            raise ValueError("Укажите код контейнера")
        if stage not in CONTAINER_STAGES:
            raise ValueError("Неизвестный этап контейнера")
        now = _now()
        with self._lock:
            with self._conn() as conn:
                cur = conn.execute(
                    """
                    INSERT INTO shipping_containers
                      (code, title, stage, note, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        code_clean,
                        (title or "").strip(),
                        stage,
                        (note or "").strip(),
                        now,
                        now,
                    ),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM shipping_containers WHERE id = ?",
                    (cur.lastrowid,),
                ).fetchone()
                return self._container_from_row(conn, row)

    def update_container(
        self,
        container_id: int,
        *,
        code: str | None = None,
        title: str | None = None,
        note: str | None = None,
    ) -> ContainerOut:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM shipping_containers WHERE id = ?",
                    (int(container_id),),
                ).fetchone()
                if not row:
                    raise KeyError("container not found")
                new_code = row["code"] if code is None else code.strip()
                new_title = row["title"] if title is None else title.strip()
                new_note = row["note"] if note is None else note.strip()
                if not new_code:
                    raise ValueError("Укажите код контейнера")
                conn.execute(
                    """
                    UPDATE shipping_containers
                    SET code = ?, title = ?, note = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (new_code, new_title, new_note, _now(), int(container_id)),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM shipping_containers WHERE id = ?",
                    (int(container_id),),
                ).fetchone()
                return self._container_from_row(conn, row)

    def delete_container(self, container_id: int) -> None:
        with self._lock:
            with self._conn() as conn:
                cur = conn.execute(
                    "DELETE FROM shipping_containers WHERE id = ?",
                    (int(container_id),),
                )
                conn.commit()
                if cur.rowcount == 0:
                    raise KeyError("container not found")

    def add_deal(self, container_id: int, deal_id: int) -> ContainerOut:
        with self._lock:
            with self._conn() as conn:
                c = conn.execute(
                    "SELECT id FROM shipping_containers WHERE id = ?",
                    (int(container_id),),
                ).fetchone()
                if not c:
                    raise KeyError("container not found")
                d = conn.execute(
                    "SELECT id, status FROM deals WHERE id = ?",
                    (int(deal_id),),
                ).fetchone()
                if not d:
                    raise KeyError("deal not found")
                existing = conn.execute(
                    "SELECT container_id FROM container_items WHERE deal_id = ?",
                    (int(deal_id),),
                ).fetchone()
                if existing:
                    if int(existing["container_id"]) == int(container_id):
                        row = conn.execute(
                            "SELECT * FROM shipping_containers WHERE id = ?",
                            (int(container_id),),
                        ).fetchone()
                        return self._container_from_row(conn, row)
                    # Move from another container
                    conn.execute(
                        "DELETE FROM container_items WHERE deal_id = ?",
                        (int(deal_id),),
                    )
                conn.execute(
                    """
                    INSERT INTO container_items (container_id, deal_id, added_at)
                    VALUES (?, ?, ?)
                    """,
                    (int(container_id), int(deal_id), _now()),
                )
                conn.execute(
                    "UPDATE shipping_containers SET updated_at = ? WHERE id = ?",
                    (_now(), int(container_id)),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM shipping_containers WHERE id = ?",
                    (int(container_id),),
                ).fetchone()
                return self._container_from_row(conn, row)

    def remove_deal(self, container_id: int, deal_id: int) -> ContainerOut:
        with self._lock:
            with self._conn() as conn:
                cur = conn.execute(
                    """
                    DELETE FROM container_items
                    WHERE container_id = ? AND deal_id = ?
                    """,
                    (int(container_id), int(deal_id)),
                )
                if cur.rowcount == 0:
                    raise KeyError("deal not in container")
                conn.execute(
                    "UPDATE shipping_containers SET updated_at = ? WHERE id = ?",
                    (_now(), int(container_id)),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM shipping_containers WHERE id = ?",
                    (int(container_id),),
                ).fetchone()
                if not row:
                    raise KeyError("container not found")
                return self._container_from_row(conn, row)

    def set_stage(self, container_id: int, stage: ContainerStage) -> ContainerOut:
        if stage not in CONTAINER_STAGES:
            raise ValueError("Неизвестный этап контейнера")
        with self._lock:
            with self._conn() as conn:
                cur = conn.execute(
                    """
                    UPDATE shipping_containers
                    SET stage = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (stage, _now(), int(container_id)),
                )
                if cur.rowcount == 0:
                    raise KeyError("container not found")
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM shipping_containers WHERE id = ?",
                    (int(container_id),),
                ).fetchone()
                return self._container_from_row(conn, row)

    def list_templates(self) -> list[SmsTemplateOut]:
        with self._lock:
            with self._conn() as conn:
                rows = conn.execute(
                    "SELECT * FROM sms_templates ORDER BY id ASC"
                ).fetchall()
                return [self._template_from_row(r) for r in rows]

    def get_template(self, template_id: int) -> SmsTemplateOut | None:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM sms_templates WHERE id = ?",
                    (int(template_id),),
                ).fetchone()
                return self._template_from_row(row) if row else None

    def create_template(self, *, title: str, body: str, kind: str = "container_stage") -> SmsTemplateOut:
        now = _now()
        with self._lock:
            with self._conn() as conn:
                cur = conn.execute(
                    """
                    INSERT INTO sms_templates (title, body, kind, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    ((title or "").strip(), (body or "").strip(), kind or "container_stage", now, now),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM sms_templates WHERE id = ?",
                    (cur.lastrowid,),
                ).fetchone()
                return self._template_from_row(row)

    def update_template(
        self, template_id: int, *, title: str | None = None, body: str | None = None
    ) -> SmsTemplateOut:
        with self._lock:
            with self._conn() as conn:
                row = conn.execute(
                    "SELECT * FROM sms_templates WHERE id = ?",
                    (int(template_id),),
                ).fetchone()
                if not row:
                    raise KeyError("template not found")
                new_title = row["title"] if title is None else title.strip()
                new_body = row["body"] if body is None else body.strip()
                if not new_title or not new_body:
                    raise ValueError("Заголовок и текст обязательны")
                conn.execute(
                    """
                    UPDATE sms_templates
                    SET title = ?, body = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (new_title, new_body, _now(), int(template_id)),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM sms_templates WHERE id = ?",
                    (int(template_id),),
                ).fetchone()
                return self._template_from_row(row)

    def delete_template(self, template_id: int) -> None:
        with self._lock:
            with self._conn() as conn:
                cur = conn.execute(
                    "DELETE FROM sms_templates WHERE id = ?",
                    (int(template_id),),
                )
                conn.commit()
                if cur.rowcount == 0:
                    raise KeyError("template not found")

    @staticmethod
    def _template_from_row(row: sqlite3.Row) -> SmsTemplateOut:
        return SmsTemplateOut(
            id=int(row["id"]),
            title=row["title"] or "",
            body=row["body"] or "",
            kind=row["kind"] or "container_stage",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    @staticmethod
    def render_message(
        template: str,
        *,
        container_code: str,
        stage: str,
        car: str = "",
        client: str = "",
    ) -> str:
        stage_label = container_stage_label(stage)
        text = template or ""
        replacements = {
            "{container}": container_code,
            "{stage}": stage_label,
            "{car}": car or "авто",
            "{client}": client or "клиент",
        }
        for key, value in replacements.items():
            text = text.replace(key, value)
        return text.strip()

    def stages_meta(self) -> list[dict[str, str]]:
        return [{"key": k, "label": CONTAINER_STAGE_LABELS[k]} for k in CONTAINER_STAGES]


logistics_store = LogisticsStore()
