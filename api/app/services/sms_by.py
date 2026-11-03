"""SMS.BY client — quick SMS and cabinet credential notices.

Docs: https://sms.by/api-docs/sms-messages
Env: SMS_BY_TOKEN, SMS_BY_ALPHANAME_ID, SMS_BY_ENABLED
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Sequence

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

SMS_BY_BASE = "https://app.sms.by/api/v1"
CABINET_URL = "https://mg-group.by/cabinet/"
# Пауза между SMS в очереди (логистика) — меньше отказов SMS.BY
SMS_QUEUE_GAP_SEC = 2.0
SMS_HTTP_TIMEOUT = 30.0
SMS_MAX_ATTEMPTS = 3


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
        async with httpx.AsyncClient(timeout=SMS_HTTP_TIMEOUT) as client:
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
        logger.warning("sms.by error phone=%s err=%s", phone, str(exc)[:200])
        return SmsSendResult(ok=False, error=str(exc)[:200])


def _is_retryable(result: SmsSendResult) -> bool:
    if result.ok or result.skipped:
        return False
    err = (result.error or "").lower()
    return any(
        token in err
        for token in (
            "timeout",
            "timed out",
            "connect",
            "http_429",
            "http_500",
            "http_502",
            "http_503",
            "http_504",
        )
    )


async def send_sms_with_retries(
    phone: str,
    message: str,
    *,
    attempts: int = SMS_MAX_ATTEMPTS,
) -> SmsSendResult:
    """Send one SMS; retry on timeouts / transient HTTP errors."""
    last = SmsSendResult(ok=False, error="no_attempt")
    for i in range(max(1, attempts)):
        last = await send_sms(phone, message)
        if last.ok or last.skipped or not _is_retryable(last):
            return last
        wait = 1.5 * (i + 1)
        logger.info(
            "sms.by retry phone=%s attempt=%s/%s wait=%.1fs err=%s",
            phone,
            i + 1,
            attempts,
            wait,
            last.error,
        )
        await asyncio.sleep(wait)
    return last


async def send_sms_queue(
    jobs: Sequence[tuple[str, str] | tuple[str, str, int]],
    *,
    gap_sec: float = SMS_QUEUE_GAP_SEC,
    on_result: Callable[[int, SmsSendResult], Any] | None = None,
) -> None:
    """Send many SMS one-by-one with a pause (logistics container move).

    A job may carry a third item — the ``sms_log`` row id — in which case
    ``on_result(log_id, result)`` is called after every send so the journal
    shows what actually left SMS.BY.
    """
    total = len(jobs)
    for i, job in enumerate(jobs):
        phone, message = job[0], job[1]
        log_id = int(job[2]) if len(job) > 2 and job[2] is not None else None
        if i > 0 and gap_sec > 0:
            await asyncio.sleep(gap_sec)
        result = await send_sms_with_retries(phone, message)
        logger.info(
            "sms.queue %s/%s phone=%s ok=%s skipped=%s err=%s",
            i + 1,
            total,
            phone,
            result.ok,
            result.skipped,
            result.error or "",
        )
        if log_id is not None and on_result is not None:
            try:
                on_result(log_id, result)
            except Exception as exc:  # never break the queue over the journal
                logger.warning("sms.queue log update failed id=%s: %s", log_id, exc)


@dataclass(frozen=True)
class SmsCheckResult:
    ok: bool
    sms_id: int
    sent_at: str = ""
    delivered_at: str = ""
    error: str = ""


def _unix_to_iso(value: Any) -> str:
    try:
        ts = float(value)
    except (TypeError, ValueError):
        return ""
    if ts <= 0:
        return ""
    return datetime.fromtimestamp(ts, tz=timezone.utc).replace(microsecond=0).isoformat()


async def check_sms(sms_id: int) -> SmsCheckResult:
    """SMS.BY ``checkSMS`` — delivery timestamps for one sent SMS.

    Response: ``{"sms_id": 2637396, "sent": 1616407661, "delivered": 1616407673}``;
    ``delivered`` missing/0 means not delivered yet.
    """
    settings = get_settings()
    token = (settings.sms_by_token or "").strip()
    if not settings.sms_by_enabled or not token:
        return SmsCheckResult(ok=False, sms_id=int(sms_id), error="not_configured")
    try:
        async with httpx.AsyncClient(timeout=SMS_HTTP_TIMEOUT) as client:
            res = await client.get(
                f"{SMS_BY_BASE}/checkSMS", params={"token": token, "sms_id": int(sms_id)}
            )
        if res.status_code >= 400:
            return SmsCheckResult(ok=False, sms_id=int(sms_id), error=f"http_{res.status_code}")
        data = res.json() if res.content else {}
        if not isinstance(data, dict):
            return SmsCheckResult(ok=False, sms_id=int(sms_id), error="bad_response")
        if data.get("error"):
            return SmsCheckResult(
                ok=False, sms_id=int(sms_id), error=str(data.get("error"))[:200]
            )
        return SmsCheckResult(
            ok=True,
            sms_id=int(sms_id),
            sent_at=_unix_to_iso(data.get("sent")),
            delivered_at=_unix_to_iso(data.get("delivered")),
        )
    except Exception as exc:
        return SmsCheckResult(ok=False, sms_id=int(sms_id), error=str(exc)[:200])


def format_credentials_message(*, phone: str, password: str) -> str:
    login = normalize_sms_phone(phone) if phone else phone
    return (
        f"MG.GROUP: аккаунт создан.\n"
        f"Логин: {login}\n"
        f"Пароль: {password}\n"
        f"Вход: {CABINET_URL}"
    )


def _car_line(car: str) -> str:
    car_line = (car or "").strip() or "ваш авто"
    if len(car_line) > 80:
        return car_line[:77] + "…"
    return car_line


def format_fill_map_message(*, car: str, phone: str, password: str) -> str:
    """Urge client to fill dismantle map; include car + cabinet login."""
    login = normalize_sms_phone(phone) if phone else phone
    return (
        f"MG.GROUP: заполните карту разбора в срочном порядке.\n"
        f"Авто: {_car_line(car)}\n"
        f"{CABINET_URL}\n"
        f"Логин: {login}\n"
        f"Пароль: {password}"
    )


def format_deal_added_fill_map_message(*, car: str) -> str:
    """Service SMS: car added to cabinet — please fill dismantle map."""
    return (
        f"MG.GROUP: добавлен автомобиль.\n"
        f"Авто: {_car_line(car)}\n"
        f"Зайдите в кабинет и заполните карту разбора:\n"
        f"{CABINET_URL}"
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


async def notify_deal_added_fill_map(*, phone: str, car: str) -> SmsSendResult:
    """Service SMS after manager adds a deal (requires consent_service)."""
    return await send_sms(phone, format_deal_added_fill_map_message(car=car))
