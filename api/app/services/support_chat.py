"""Live site chat: visitors write on the site, managers answer in Telegram.

A separate bot posts every visitor message to the manager chats. A manager
answers with Telegram's "reply", and the widget picks the answer up by polling.
Messages live in the cabinet SQLite DB, so a restart loses nothing.
"""

from __future__ import annotations

import asyncio
import logging
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger("mg.support")

TELEGRAM_API = "https://api.telegram.org"
MAX_TEXT = 2000
GREETING = "Здравствуйте! Напишите, какой автомобиль вас интересует, менеджер ответит здесь."
FALLBACK = "Не удалось передать сообщение менеджеру. Позвоните нам: +375 33 617 36 17."
NEED_REPLY = "Чтобы ответить клиенту, нажмите «Ответить» на его сообщении."
TEXT_ONLY = "Клиенту можно отправить только текст."

# Telegram cannot tell whether a person is around, so "online" means working
# hours: weekdays 9:00-19:00 in Minsk (UTC+3 all year), as on the site.
_MINSK = timezone(timedelta(hours=3))
WORK_HOURS = (9, 19)

_lock = threading.Lock()


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(Path(get_settings().cabinet_db_path)), timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init() -> None:
    with _lock, _db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS support_messages (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_support_messages_session
              ON support_messages(session_id, created_at);
            CREATE TABLE IF NOT EXISTS support_tg_links (
              chat_id INTEGER NOT NULL,
              message_id INTEGER NOT NULL,
              session_id TEXT NOT NULL,
              PRIMARY KEY (chat_id, message_id)
            );
            CREATE TABLE IF NOT EXISTS support_state (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            """
        )


def manager_chat_ids() -> list[int]:
    out: list[int] = []
    for raw in (get_settings().support_chat_ids or "").split(","):
        raw = raw.strip()
        if raw.lstrip("-").isdigit():
            out.append(int(raw))
    return out


def is_online(now: datetime | None = None) -> bool:
    local = (now or datetime.now(timezone.utc)).astimezone(_MINSK)
    return local.weekday() < 5 and WORK_HOURS[0] <= local.hour < WORK_HOURS[1]


def is_enabled() -> bool:
    return bool((get_settings().support_bot_token or "").strip() and manager_chat_ids())


def add_message(session_id: str, role: str, content: str) -> dict[str, Any]:
    row = {
        "id": uuid.uuid4().hex,
        "role": role,
        "content": content,
        "createdAt": int(time.time() * 1000),
    }
    with _lock, _db() as conn:
        conn.execute(
            "INSERT INTO support_messages (id, session_id, role, content, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (row["id"], session_id, role, content, row["createdAt"]),
        )
    return row


def list_messages(session_id: str, limit: int = 200) -> list[dict[str, Any]]:
    with _lock, _db() as conn:
        rows = conn.execute(
            "SELECT id, role, content, created_at FROM support_messages"
            " WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
    return [
        {"id": r["id"], "role": r["role"], "content": r["content"], "createdAt": r["created_at"]}
        for r in reversed(rows)
    ]


def link_message(chat_id: int, message_id: int, session_id: str) -> None:
    with _lock, _db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO support_tg_links (chat_id, message_id, session_id)"
            " VALUES (?, ?, ?)",
            (chat_id, message_id, session_id),
        )


def session_for_reply(chat_id: int, message_id: int) -> str | None:
    with _lock, _db() as conn:
        row = conn.execute(
            "SELECT session_id FROM support_tg_links WHERE chat_id = ? AND message_id = ?",
            (chat_id, message_id),
        ).fetchone()
    return row["session_id"] if row else None


def get_offset() -> int:
    with _lock, _db() as conn:
        row = conn.execute("SELECT value FROM support_state WHERE key = 'offset'").fetchone()
    return int(row["value"]) if row else 0


def set_offset(offset: int) -> None:
    with _lock, _db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO support_state (key, value) VALUES ('offset', ?)", (str(offset),)
        )


async def _send(client: httpx.AsyncClient, chat_id: int, text: str) -> int | None:
    token = get_settings().support_bot_token.strip()
    try:
        res = await client.post(
            f"{TELEGRAM_API}/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        )
        data = res.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("support send failed chat=%s: %s", chat_id, type(exc).__name__)
        return None
    if not data.get("ok"):
        logger.warning("support send refused chat=%s: %s", chat_id, data.get("description"))
        return None
    return int(data["result"]["message_id"])


async def notify_managers(
    session_id: str,
    text: str,
    *,
    page: str = "",
    transport: httpx.AsyncBaseTransport | None = None,
) -> None:
    """Post a visitor message to every manager. If nobody got it, tell the visitor."""
    body = "\n".join(
        part
        for part in (
            f"💬 Сообщение с сайта · клиент {session_id[:6]}",
            f"Страница: {page}" if page else "",
            "",
            text,
            "",
            "↩️ Нажмите «Ответить», и клиент увидит ответ на сайте.",
        )
        if part is not None
    )
    delivered = 0
    async with httpx.AsyncClient(timeout=15.0, transport=transport) as client:
        for chat_id in manager_chat_ids():
            message_id = await _send(client, chat_id, body)
            if message_id is not None:
                link_message(chat_id, message_id, session_id)
                delivered += 1
    if not delivered:
        add_message(session_id, "system", FALLBACK)


async def handle_update(update: dict[str, Any], client: httpx.AsyncClient) -> None:
    msg = update.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    managers = manager_chat_ids()
    # Only manager chats can reach visitors.
    if chat_id not in managers:
        return
    reply_to = (msg.get("reply_to_message") or {}).get("message_id")
    session_id = session_for_reply(chat_id, reply_to) if reply_to else None
    if not session_id:
        await _send(client, chat_id, NEED_REPLY)
        return
    text = (msg.get("text") or "").strip()[:MAX_TEXT]
    if not text:
        await _send(client, chat_id, TEXT_ONLY)
        return
    add_message(session_id, "agent", text)
    link_message(chat_id, int(msg["message_id"]), session_id)
    # Keep the other manager in the loop so nobody answers twice.
    who = (msg.get("from") or {}).get("first_name") or "Менеджер"
    for other in managers:
        if other != chat_id:
            sent = await _send(client, other, f"✅ {who} ответил клиенту {session_id[:6]}:\n{text}")
            if sent is not None:
                link_message(other, sent, session_id)


async def poll_loop(stop: asyncio.Event) -> None:
    """Long-poll Telegram. Exactly one process may poll a bot: the public node."""
    token = get_settings().support_bot_token.strip()
    url = f"{TELEGRAM_API}/bot{token}/getUpdates"
    async with httpx.AsyncClient(timeout=httpx.Timeout(40.0, connect=15.0)) as client:
        while not stop.is_set():
            try:
                res = await client.get(
                    url,
                    params={"offset": get_offset(), "timeout": 30, "allowed_updates": '["message"]'},
                )
                data = res.json()
                if not data.get("ok"):
                    # 409: a webhook or another process owns this bot.
                    logger.warning("support poll refused: %s", data.get("description"))
                    await asyncio.sleep(30)
                    continue
                for update in data.get("result") or []:
                    try:
                        await handle_update(update, client)
                    except Exception as exc:
                        logger.warning("support update failed: %s", type(exc).__name__)
                    set_offset(int(update["update_id"]) + 1)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("support poll error: %s", type(exc).__name__)
                await asyncio.sleep(10)
