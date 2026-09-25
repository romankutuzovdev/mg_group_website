"""JWT helpers and FastAPI auth dependencies for the cabinet."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.models.cabinet import UserOut
from app.services.cabinet_store import cabinet_store

_bearer = HTTPBearer(auto_error=False)


def create_access_token(
    *,
    telegram_id: int,
    user_id: int,
    settings: Settings | None = None,
) -> str:
    s = settings or get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(telegram_id),
        "uid": user_id,
        "iat": now,
        "exp": now + timedelta(days=max(1, s.jwt_ttl_days)),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def decode_access_token(token: str, settings: Settings | None = None) -> dict[str, Any]:
    s = settings or get_settings()
    try:
        return jwt.decode(token, s.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def get_current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> UserOut:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    payload = decode_access_token(creds.credentials, settings)
    try:
        telegram_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid token subject") from exc

    user = cabinet_store.get_user_by_telegram_id(telegram_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_optional_user(
    settings: Annotated[Settings, Depends(get_settings)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> UserOut | None:
    if creds is None or creds.scheme.lower() != "bearer":
        return None
    try:
        payload = decode_access_token(creds.credentials, settings)
        telegram_id = int(payload["sub"])
    except Exception:
        return None
    return cabinet_store.get_user_by_telegram_id(telegram_id)


def require_admin(
    user: Annotated[UserOut, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header()] = None,
) -> UserOut:
    """Allow JWT admin OR ingest API key (for scripts)."""
    expected = settings.ingest_api_key.strip()
    if expected and x_api_key == expected:
        return user if user.is_admin else UserOut(
            id=0,
            telegram_id=0,
            username="api-key",
            first_name="API",
            last_name="Key",
            is_admin=True,
            created_at="",
        )
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def require_admin_or_key(
    settings: Annotated[Settings, Depends(get_settings)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> UserOut:
    expected = settings.ingest_api_key.strip()
    if expected and x_api_key == expected:
        return UserOut(
            id=0,
            telegram_id=0,
            username="api-key",
            first_name="API",
            last_name="Key",
            is_admin=True,
            created_at="",
        )
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Admin auth required")
    payload = decode_access_token(creds.credentials, settings)
    telegram_id = int(payload["sub"])
    user = cabinet_store.get_user_by_telegram_id(telegram_id)
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user
