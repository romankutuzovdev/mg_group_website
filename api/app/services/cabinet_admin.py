"""Shared cabinet auth helpers (no FastAPI deps — safe to import from store)."""

from __future__ import annotations

from app.config import Settings, get_settings


def parse_admin_ids(raw: str) -> set[int]:
    out: set[int] = set()
    for part in (raw or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.add(int(part))
        except ValueError:
            continue
    return out


def is_admin_telegram(telegram_id: int, settings: Settings | None = None) -> bool:
    s = settings or get_settings()
    return telegram_id in parse_admin_ids(s.cabinet_admin_telegram_ids)
