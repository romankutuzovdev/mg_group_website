"""Telegram Login Widget + Mini App initData signature verification."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any
from urllib.parse import parse_qsl

from fastapi import HTTPException


def verify_telegram_login(
    data: dict[str, Any],
    *,
    bot_token: str,
    max_age_seconds: int = 86400,
) -> dict[str, Any]:
    """Validate Telegram Login Widget payload.

    See https://core.telegram.org/widgets/login#checking-authorization
    """
    if not bot_token.strip():
        raise HTTPException(
            status_code=503,
            detail="TELEGRAM_BOT_TOKEN is not configured",
        )

    check_hash = str(data.get("hash") or "")
    if not check_hash:
        raise HTTPException(status_code=401, detail="Missing Telegram hash")

    pairs = []
    for key, value in data.items():
        if key == "hash" or value is None or value == "":
            continue
        pairs.append(f"{key}={value}")
    pairs.sort()
    data_check_string = "\n".join(pairs)

    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    calculated = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated, check_hash):
        raise HTTPException(status_code=401, detail="Invalid Telegram login hash")

    try:
        auth_date = int(data.get("auth_date") or 0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid auth_date") from exc

    if auth_date <= 0:
        raise HTTPException(status_code=401, detail="Invalid auth_date")

    age = int(time.time()) - auth_date
    if age > max_age_seconds:
        raise HTTPException(status_code=401, detail="Telegram login expired")

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
    if not bot_token.strip():
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
        bot_token.encode("utf-8"),
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
