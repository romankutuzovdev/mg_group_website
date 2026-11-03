"""Forward Chrome-only requests from the public VPS to the Windows scraper API.

The calculator's ``lot-from-url`` opens the auction page in Chrome. Chrome lives
only on the Windows host (``APP_ROLE=scraper``), so the public node proxies the
request there and returns the Windows answer unchanged to the site.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.config import get_settings

logger = logging.getLogger("mg.scraper_proxy")

LOT_FROM_URL_PATH = "/api/v1/pricing/lot-from-url"


def _role() -> str:
    return (get_settings().app_role or "all").strip().lower()


def scraper_api_base() -> str:
    """Windows API origin. Explicit SCRAPER_API_URL, else host of LOTS_SOURCE_URL."""
    settings = get_settings()
    explicit = (settings.scraper_api_url or "").strip().rstrip("/")
    if explicit:
        return explicit
    for candidate in (settings.lots_source_url, settings.cabinet_source_url):
        raw = (candidate or "").strip()
        if not raw:
            continue
        parts = urlsplit(raw)
        if parts.scheme and parts.netloc:
            return urlunsplit((parts.scheme, parts.netloc, "", "", ""))
    return ""


def scraper_api_key() -> str:
    settings = get_settings()
    return (
        settings.scraper_api_key
        or settings.lots_source_api_key
        or settings.ingest_api_key
        or ""
    ).strip()


def should_proxy_lot_lookup() -> bool:
    """Public node without Chrome → send the lookup to Windows."""
    return _role() == "public" and bool(scraper_api_base())


async def proxy_lot_from_url(
    url: str,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """POST the lot URL to Windows and return its JSON payload.

    Raises ``RuntimeError`` on network errors, non-2xx or non-object JSON so the
    caller can fall back to a soft payload with a readable ``error``.
    """
    base = scraper_api_base()
    if not base:
        raise RuntimeError("SCRAPER_API_URL not set")
    settings = get_settings()
    timeout_total = max(20.0, float(settings.scraper_api_timeout_seconds or 75.0))
    headers = {"Accept": "application/json"}
    key = scraper_api_key()
    if key:
        headers["X-API-Key"] = key
    target = f"{base}{LOT_FROM_URL_PATH}"
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_total, connect=15.0),
            transport=transport,
            follow_redirects=False,
        ) as client:
            res = await client.post(target, json={"url": url}, headers=headers)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"scraper_unreachable:{type(exc).__name__}") from exc
    if res.status_code >= 300:
        snippet = (res.text or "")[:120].replace("\n", " ")
        raise RuntimeError(f"scraper_http_{res.status_code}:{snippet}")
    try:
        payload = res.json()
    except ValueError as exc:
        raise RuntimeError("scraper_bad_json") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("scraper_bad_payload")
    payload["proxied"] = True
    payload.setdefault("via", "windows_proxy")
    return payload
