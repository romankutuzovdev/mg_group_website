"""Phone login helpers and PBKDF2 password hashing (stdlib only)."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets

_PBKDF2_ROUNDS = 120_000
_PHONE_TG_BASE = 921_000_000_000


def normalize_phone(raw: str) -> str:
    """Keep digits only. Accepts +375… / 80… / spaces. Local BY 80… → 375…"""
    digits = re.sub(r"\D+", "", (raw or "").strip())
    # 8029… → 37529…
    if len(digits) == 11 and digits.startswith("80"):
        digits = "375" + digits[2:]
    # 029… (10 digits with trunk 0) → 37529…
    if len(digits) == 10 and digits.startswith("0"):
        digits = "375" + digits[1:]
    if len(digits) < 9 or len(digits) > 15:
        raise ValueError("Укажите номер телефона (9–15 цифр), например +375291234567")
    return digits


def format_phone_display(phone: str) -> str:
    p = re.sub(r"\D+", "", phone or "")
    if len(p) == 12 and p.startswith("375"):
        return f"+{p[:3]} ({p[3:5]}) {p[5:8]}-{p[8:10]}-{p[10:12]}"
    if len(p) == 11 and p.startswith("7"):
        return f"+{p[0]} ({p[1:4]}) {p[4:7]}-{p[7:9]}-{p[9:11]}"
    return f"+{p}" if p else ""


def synthetic_telegram_id(phone: str) -> int:
    """Stable synthetic Telegram id for phone-only cabinet accounts."""
    digest = hashlib.sha256(f"mg-phone:{phone}".encode("utf-8")).hexdigest()
    return _PHONE_TG_BASE + (int(digest[:10], 16) % 8_000_000_000)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        _PBKDF2_ROUNDS,
    )
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds_s, salt_hex, hash_hex = (stored or "").split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        rounds = int(rounds_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        got = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            rounds,
        )
        return hmac.compare_digest(got, expected)
    except Exception:
        return False


def generate_password(length: int = 8) -> str:
    """Readable password without ambiguous characters."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(max(6, min(32, length))))
