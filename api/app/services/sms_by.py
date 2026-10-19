"""SMS.BY client — quick SMS and cabinet credential notices.

Docs: https://sms.by/api-docs/sms-messages
Env: SMS_BY_TOKEN, SMS_BY_ALPHANAME_ID, SMS_BY_ENABLED
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

SMS_BY_BASE = "https://app.sms.by/api/v1"
CABINET_URL = "https://mg-group.by/cabinet/"


@dataclass(frozen=True)
class SmsSendResult:
    ok: bool
    sms_id: int | None = None
    status: str = ""
    error: str = ""
    skipped: bool = False


def is_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.sms_by_enabled
        and (settings.sms_by_token or "").strip()
        and (settings.sms_by_alphaname_id or "").strip()
    )


def normalize_sms_phone(raw: str) -> str:
    """Digits only; convert BY 80… → 375… for SMS.BY."""
    digits = re.sub(r"\D+", "", (raw or "").strip())
    if digits.startswith("80") and len(digits) == 11:
        digits = "375" + digits[2:]
    if len(digits) < 9 or len(digits) > 15:
        raise ValueError("Некорректный номер для SMS")
    return digits


async def send_sms(phone: str, message: str) -> SmsSendResult:
    """Send one SMS via SMS.BY sendQuickSMS. No-op if not configured."""
    settings = get_settings()
    if not settings.sms_by_enabled:
        logger.info("sms.by skipped: SMS_BY_ENABLED=false")
        return SmsSendResult(ok=False, skipped=True, error="disabled")
    token = (settings.sms_by_token or "").strip()
    alphaname_id = (settings.sms_by_alphaname_id or "").strip()
    if not token or not alphaname_id:
        logger.warning("sms.by skipped: missing SMS_BY_TOKEN or SMS_BY_ALPHANAME_ID")
        return SmsSendResult(ok=False, skipped=True, error="not_configured")

    text = (message or "").strip()
    if not text:
        return SmsSendResult(ok=False, error="empty_message")

    try:
        phone_digits = normalize_sms_phone(phone)
    except ValueError as exc:
        return SmsSendResult(ok=False, error=str(exc))

    url = f"{SMS_BY_BASE}/sendQuickSMS"
    params: dict[str, Any] = {
        "token": token,
        "message": text,
        "phone": phone_digits,
        "alphaname_id": alphaname_id,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(url, params=params)
        body_preview = (res.text or "")[:400]
        if res.status_code >= 400:
            logger.warning(
                "sms.by send failed phone=%s status=%s body=%s",
                phone_digits,
                res.status_code,
                body_preview,
            )
            return SmsSendResult(ok=False, error=f"http_{res.status_code}")
        data = res.json() if res.content else {}
        if isinstance(data, dict) and data.get("error"):
            err = str(data.get("error") or data.get("message") or "api_error")
            logger.warning("sms.by api error phone=%s err=%s", phone_digits, err)
            return SmsSendResult(ok=False, error=err)
        sms_id_raw = data.get("sms_id") if isinstance(data, dict) else None
        sms_id = int(sms_id_raw) if sms_id_raw is not None else None
        status = str((data or {}).get("status") or "OK") if isinstance(data, dict) else "OK"
        logger.info("sms.by sent phone=%s sms_id=%s status=%s", phone_digits, sms_id, status)
        return SmsSendResult(ok=True, sms_id=sms_id, status=status)
    except Exception as exc:
        logger.exception("sms.by error phone=%s", phone)
        return SmsSendResult(ok=False, error=str(exc)[:200])


def format_credentials_message(*, phone: str, password: str) -> str:
    login = normalize_sms_phone(phone) if phone else phone
    return (
        f"MG.GROUP кабинет\n"
        f"Логин: {login}\n"
        f"Пароль: {password}\n"
        f"{CABINET_URL}"
    )


def format_fill_map_message(*, car: str, phone: str, password: str) -> str:
    """Urge client to fill dismantle map; include car + cabinet login."""
    login = normalize_sms_phone(phone) if phone else phone
    car_line = (car or "").strip() or "ваш авто"
    if len(car_line) > 80:
        car_line = car_line[:77] + "…"
    return (
        f"MG.GROUP: заполните карту разбора в срочном порядке.\n"
        f"Авто: {car_line}\n"
        f"{CABINET_URL}\n"
        f"Логин: {login}\n"
        f"Пароль: {password}"
    )


async def notify_client_credentials(*, phone: str, password: str) -> SmsSendResult:
    """Send login/password SMS to a new or updated client account."""
    return await send_sms(phone, format_credentials_message(phone=phone, password=password))


async def notify_fill_dismantle_map(
    *, phone: str, password: str, car: str
) -> SmsSendResult:
    """SMS: fill dismantle map urgently + credentials."""
    return await send_sms(
        phone,
        format_fill_map_message(car=car, phone=phone, password=password),
    )
