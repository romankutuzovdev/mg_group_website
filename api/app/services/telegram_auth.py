"""Telegram Login Widget + Mini App initData signature verification."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from typing import Any
from urllib.parse import parse_qsl

from fastapi import HTTPException

# Fields Telegram may include in Login Widget authorization data
_LOGIN_KEYS = ("id", "first_name", "last_name", "username", "photo_url", "auth_date")


def clean_bot_token(token: str) -> str:
    """Normalize token from .env (quotes, spaces, accidental bot prefix)."""
    t = (token or "").strip().strip("\ufeff").strip('"').strip("'").strip()
    # People sometimes paste api.telegram.org/bot<TOKEN>
    if "api.telegram.org/bot" in t.lower():
        t = re.split(r"api\.telegram\.org/bot", t, flags=re.I)[-1]
        t = t.split("?", 1)[0].split("/", 1)[0].strip()
    if re.match(r"^bot\d+:", t, re.I):
        t = t[3:]
    return t.strip()


def _login_check_pairs(data: dict[str, Any]) -> list[str]:
    """Build Telegram data-check-string pairs (sorted later)."""
    pairs: list[str] = []
    for key in _LOGIN_KEYS:
        if key not in data:
            continue
        value = data.get(key)
        if value is None:
            continue
        text = str(value).strip() if isinstance(value, str) else str(value)
        if text == "":
            continue
        pairs.append(f"{key}={text}")
    return pairs


def verify_telegram_login(
    data: dict[str, Any],
    *,
    bot_token: str,
    max_age_seconds: int = 86400,
) -> dict[str, Any]:
    """Validate Telegram Login Widget payload.

    See https://core.telegram.org/widgets/login#checking-authorization
    """
    token = clean_bot_token(bot_token)
    if not token:
        raise HTTPException(
            status_code=503,
            detail="TELEGRAM_BOT_TOKEN is not configured",
        )

    check_hash = str(data.get("hash") or "").strip()
    if not check_hash:
        raise HTTPException(status_code=401, detail="Missing Telegram hash")

    pairs = _login_check_pairs(data)
    pairs.sort()
    data_check_string = "\n".join(pairs)

    secret_key = hashlib.sha256(token.encode("utf-8")).digest()
    calculated = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated, check_hash):
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid Telegram login hash. "
                "Проверьте TELEGRAM_BOT_TOKEN у бота из TELEGRAM_BOT_USERNAME "
                "и Domain в BotFather (mg-group.by)."
            ),
        )

    try:
        auth_date = int(data.get("auth_date") or 0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid auth_date") from exc

    if auth_date <= 0:
        raise HTTPException(status_code=401, detail="Invalid auth_date")

    age = int(time.time()) - auth_date
    if age > max_age_seconds:
        raise HTTPException(status_code=401, detail="Telegram login expired")
    if age < -120:
        raise HTTPException(status_code=401, detail="Telegram auth_date is in the future")

    try:
        telegram_id = int(data["id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Telegram user id") from exc

    return {
        "telegram_id": telegram_id,
        "first_name": str(data.get("first_name") or ""),
        "last_name": str(data.get("last_name") or ""),
        "username": str(data.get("username") or ""),
        "photo_url": str(data.get("photo_url") or ""),
        "auth_date": auth_date,
    }


def verify_telegram_webapp_init_data(
    init_data: str,
    *,
    bot_token: str,
    max_age_seconds: int = 86400,
) -> dict[str, Any]:
    """Validate Telegram Mini App `WebApp.initData` string.

    See https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    token = clean_bot_token(bot_token)
    if not token:
        raise HTTPException(
            status_code=503,
            detail="TELEGRAM_BOT_TOKEN is not configured",
        )

    raw = (init_data or "").strip()
    if not raw:
        raise HTTPException(status_code=401, detail="Missing initData")

    parsed = dict(parse_qsl(raw, keep_blank_values=True))
    check_hash = str(parsed.pop("hash", "") or "")
    if not check_hash:
        raise HTTPException(status_code=401, detail="Missing Telegram hash")

    pairs = [f"{k}={v}" for k, v in parsed.items() if k != "hash"]
    pairs.sort()
    data_check_string = "\n".join(pairs)

    secret_key = hmac.new(
        b"WebAppData",
        token.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    calculated = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated, check_hash):
        raise HTTPException(status_code=401, detail="Invalid Telegram WebApp hash")

    try:
        auth_date = int(parsed.get("auth_date") or 0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid auth_date") from exc

    if auth_date <= 0:
        raise HTTPException(status_code=401, detail="Invalid auth_date")

    age = int(time.time()) - auth_date
    if age > max_age_seconds:
        raise HTTPException(status_code=401, detail="Telegram WebApp auth expired")

    user_raw = parsed.get("user") or ""
    try:
        user_obj = json.loads(user_raw) if user_raw else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=401, detail="Invalid Telegram user payload") from exc

    if not isinstance(user_obj, dict):
        raise HTTPException(status_code=401, detail="Invalid Telegram user payload")

    try:
        telegram_id = int(user_obj["id"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Telegram user id") from exc

    photo = user_obj.get("photo_url") or ""
    return {
        "telegram_id": telegram_id,
        "first_name": str(user_obj.get("first_name") or ""),
        "last_name": str(user_obj.get("last_name") or ""),
        "username": str(user_obj.get("username") or ""),
        "photo_url": str(photo),
        "auth_date": auth_date,
    }
