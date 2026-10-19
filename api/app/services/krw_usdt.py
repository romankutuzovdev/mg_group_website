"""KRW per 1 USDT — Bithumb ticker (same rate as Naver «빗썸테더»).

Naver mobile search for 빗썸테더 shows Bithumb USDT/KRW.
We read the exchange API directly (stable JSON) instead of scraping HTML.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger("mg.krw_usdt")

_BITHUMB_URL = "https://api.bithumb.com/public/ticker/USDT_KRW"
# Fallback ≈ yesterday's Bithumb (user example: 1343)
_DEFAULT_RATE = 1343.0
_CACHE_TTL_SEC = 300.0
_cache: dict[str, Any] = {"rate": _DEFAULT_RATE, "at": 0.0, "source": "default"}


def default_krw_per_usdt() -> float:
    return _DEFAULT_RATE


def get_krw_per_usdt(*, force: bool = False) -> dict[str, Any]:
    """Return {rate, source, asOf} — cached 5 min."""
    now = time.time()
    if (
        not force
        and _cache.get("at")
        and now - float(_cache["at"]) < _CACHE_TTL_SEC
        and float(_cache.get("rate") or 0) > 0
    ):
        return {
            "rate": float(_cache["rate"]),
            "source": str(_cache.get("source") or "cache"),
            "asOf": _cache.get("asOf"),
        }

    rate, source, as_of = _fetch_bithumb()
    if rate is None:
        rate = float(_cache.get("rate") or _DEFAULT_RATE)
        source = str(_cache.get("source") or "default")
        as_of = _cache.get("asOf")
    else:
        _cache["rate"] = rate
        _cache["at"] = now
        _cache["source"] = source
        _cache["asOf"] = as_of

    return {"rate": float(rate), "source": source, "asOf": as_of}


def _fetch_bithumb() -> tuple[float | None, str, str | None]:
    try:
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            res = client.get(
                _BITHUMB_URL,
                headers={"Accept": "application/json", "User-Agent": "mg-group-api/1.0"},
            )
            if res.status_code >= 400:
                logger.warning("bithumb HTTP %s", res.status_code)
                return None, "bithumb_error", None
            payload = res.json()
    except Exception as exc:
        logger.warning("bithumb fetch failed: %s", exc)
        return None, "bithumb_error", None

    if str(payload.get("status") or "") != "0000":
        return None, "bithumb_error", None
    data = payload.get("data") or {}
    # closing_price = last trade; prev_closing_price = yesterday (user example 1343)
    raw = data.get("closing_price") or data.get("prev_closing_price")
    try:
        rate = float(str(raw).replace(",", ""))
    except (TypeError, ValueError):
        return None, "bithumb_error", None
    if not (500 < rate < 5000):
        return None, "bithumb_error", None
    as_of = None
    try:
        ms = int(data.get("date") or 0)
        if ms > 0:
            from datetime import datetime, timezone

            as_of = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat()
    except Exception:
        pass
    return rate, "bithumb", as_of


def krw_to_usd(price_krw: float, rate: float | None = None) -> float:
    r = float(rate) if rate and rate > 0 else get_krw_per_usdt()["rate"]
    if not (price_krw > 0 and r > 0):
        return 0.0
    return float(price_krw) / float(r)
