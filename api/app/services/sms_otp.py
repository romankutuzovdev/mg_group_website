"""SMS one-time codes for cabinet self-registration."""

from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass

from app.services.passwords import normalize_phone
from app.services.sms_by import send_sms


@dataclass
class OtpRecord:
    code_hash: str
    expires_at: float
    attempts: int = 0
    last_sent_at: float = 0.0


_lock = threading.Lock()
_store: dict[str, OtpRecord] = {}

OTP_TTL_SEC = 10 * 60
OTP_COOLDOWN_SEC = 60
OTP_MAX_ATTEMPTS = 5


def _hash_code(code: str) -> str:
    # constant-time compare via secrets.compare_digest on hex digests
    import hashlib

    return hashlib.sha256(code.encode("utf-8")).digest().hex()


def _purge_expired(now: float) -> None:
    dead = [k for k, v in _store.items() if v.expires_at <= now]
    for k in dead:
        _store.pop(k, None)


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def can_send(phone: str) -> tuple[bool, str]:
    try:
        key = normalize_phone(phone)
    except ValueError as exc:
        return False, str(exc)
    now = time.time()
    with _lock:
        _purge_expired(now)
        rec = _store.get(key)
        if rec and now - rec.last_sent_at < OTP_COOLDOWN_SEC:
            wait = int(OTP_COOLDOWN_SEC - (now - rec.last_sent_at)) + 1
            return False, f"Повторная отправка через {wait} с"
    return True, ""


async def send_registration_code(phone: str) -> tuple[bool, str, str | None]:
    """Send OTP SMS. Returns (ok, error_or_status, debug_code_if_any)."""
    try:
        key = normalize_phone(phone)
    except ValueError as exc:
        return False, str(exc), None

    ok_send, err = can_send(key)
    if not ok_send:
        return False, err, None

    code = generate_code()
    now = time.time()
    message = (
        f"MG.GROUP: код подтверждения {code}. "
        f"Действует 10 минут. Никому не сообщайте код."
    )
    result = await send_sms(key, message)
    debug_code: str | None = None
    if result.skipped:
        # Dev / not configured: still store code so flow can be tested
        debug_code = code
    elif not result.ok:
        return False, result.error or "Не удалось отправить SMS", None

    with _lock:
        _store[key] = OtpRecord(
            code_hash=_hash_code(code),
            expires_at=now + OTP_TTL_SEC,
            attempts=0,
            last_sent_at=now,
        )
    status = "sent" if result.ok else "stored_without_sms"
    return True, status, debug_code


def verify_code(phone: str, code: str) -> tuple[bool, str]:
    try:
        key = normalize_phone(phone)
    except ValueError as exc:
        return False, str(exc)
    raw = (code or "").strip().replace(" ", "")
    if not raw.isdigit() or len(raw) != 6:
        return False, "Введите 6-значный код из SMS"
    now = time.time()
    with _lock:
        _purge_expired(now)
        rec = _store.get(key)
        if not rec:
            return False, "Код не запрошен или истёк — запросите новый"
        if rec.expires_at <= now:
            _store.pop(key, None)
            return False, "Код истёк — запросите новый"
        if rec.attempts >= OTP_MAX_ATTEMPTS:
            _store.pop(key, None)
            return False, "Слишком много попыток — запросите новый код"
        rec.attempts += 1
        if not secrets.compare_digest(rec.code_hash, _hash_code(raw)):
            left = OTP_MAX_ATTEMPTS - rec.attempts
            if left <= 0:
                _store.pop(key, None)
                return False, "Неверный код. Запросите новый"
            return False, f"Неверный код. Осталось попыток: {left}"
        _store.pop(key, None)
    return True, ""
