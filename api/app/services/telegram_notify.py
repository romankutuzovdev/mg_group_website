"""Send Telegram bot messages (cabinet notifications)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings
from app.services.cabinet_admin import parse_admin_ids

logger = logging.getLogger(__name__)


async def send_telegram_message(chat_id: int, text: str, *, parse_mode: str = "HTML") -> bool:
    settings = get_settings()
    token = (settings.telegram_bot_token or "").strip()
    if not token or not chat_id:
        logger.warning("telegram notify skipped: missing token or chat_id=%s", chat_id)
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code >= 400:
                logger.warning(
                    "telegram notify failed chat_id=%s status=%s body=%s",
                    chat_id,
                    res.status_code,
                    res.text[:300],
                )
                return False
            return True
    except Exception:
        logger.exception("telegram notify error chat_id=%s", chat_id)
        return False


def admin_notify_chat_ids(*, preferred_telegram_id: int = 0) -> list[int]:
    """Prefer the assigning manager; fall back to all configured admins."""
    if preferred_telegram_id:
        return [preferred_telegram_id]
    return sorted(parse_admin_ids(get_settings().cabinet_admin_telegram_ids))


async def notify_dismantle_map_completed(
    *,
    manager_telegram_id: int,
    deal_id: int,
    title: str,
    vehicle_label: str,
    client_name: str,
    client_telegram_id: int,
    client_username: str = "",
) -> None:
    client_bits = []
    if client_name:
        client_bits.append(client_name)
    if client_username:
        client_bits.append(f"@{client_username}")
    if client_telegram_id:
        client_bits.append(f"TG {client_telegram_id}")
    client_line = " · ".join(client_bits) or "клиент"

    car = (vehicle_label or title or f"Сделка #{deal_id}").strip()
    text = (
        "✅ <b>Карта разбора заполнена</b>\n\n"
        f"Сделка <b>#{deal_id}</b>\n"
        f"{_escape(car)}\n"
        f"Клиент: {_escape(client_line)}\n\n"
        "Клиент отметил карту разбора как заполненную."
    )
    for chat_id in admin_notify_chat_ids(preferred_telegram_id=manager_telegram_id):
        await send_telegram_message(chat_id, text)


def _escape(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
