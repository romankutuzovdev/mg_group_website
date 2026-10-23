from __future__ import annotations

import hashlib
import hmac
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings, get_settings
from app.models.cabinet import (
    AuthResponse,
    DealCreate,
    DealUpdate,
    PasswordLoginPayload,
    RegisterConfirmPayload,
    RegisterSendCodePayload,
    StageUpdate,
)
from app.services.auth_deps import create_access_token
from app.services.cabinet_store import cabinet_store
from app.services.passwords import normalize_phone
from app.services import sms_otp

router = APIRouter(prefix="/auth", tags=["auth"])

DEV_MANAGER_TG_ID = 900001
DEV_CLIENT_TG_ID = 900002

DevRole = Literal["manager", "client"]


def _ensure_demo_deals(telegram_id: int) -> None:
    """Seed sample deals for the test account (once)."""
    user = cabinet_store.get_user_by_telegram_id(telegram_id)
    if not user:
        return
    existing = cabinet_store.list_deals_for_user(user.id)
    if existing:
        for deal in existing:
            if "Camry" in deal.title:
                cabinet_store.update_deal(
                    deal.id,
                    DealUpdate(origin_region="usa", origin_point="dismantle"),
                )
                # Keep an interesting mid-route state if still early
                keys = {s.key: s.status for s in deal.stages}
                if keys.get("ocean") == "pending" and keys.get("origin") == "active":
                    cabinet_store.update_stage(
                        deal.id, "origin", StageUpdate(status="done", note="Разобрано на площадке в NJ")
                    )
                    cabinet_store.update_stage(
                        deal.id,
                        "ocean",
                        StageUpdate(status="active", note="Контейнер в пути через Атлантику"),
                    )
            elif "BMW" in deal.title or "X5" in deal.title:
                cabinet_store.update_deal(
                    deal.id,
                    DealUpdate(origin_region="uk", origin_point="port", status="completed"),
                )
                for key, note in (
                    ("selection", "Подобран на Copart UK"),
                    ("auction", "Выигран"),
                    ("origin", "Отгрузка из порта Southampton"),
                    ("ocean", "Море пройдено"),
                    ("belarus", "Таможня РБ закрыта"),
                    ("delivery", "Выдан клиенту в Минске"),
                ):
                    cabinet_store.update_stage(
                        deal.id, key, StageUpdate(status="done", note=note)  # type: ignore[arg-type]
                    )
        return

    deal = cabinet_store.create_deal(
        DealCreate(
            telegram_id=telegram_id,
            title="2021 Toyota Camry SE",
            vin="4T1G11AK5MU********",
            lot_number="81234567",
            note="Демо: США → разборка → море → Беларусь → клиент.",
            status="active",
            origin_region="usa",
            origin_point="dismantle",
        )
    )
    cabinet_store.update_stage(deal.id, "selection", StageUpdate(status="done", note="Лот выбран"))
    cabinet_store.update_stage(
        deal.id,
        "auction",
        StageUpdate(status="done", note="Выигран за $8 400 + fees"),
    )
    cabinet_store.update_stage(
        deal.id,
        "origin",
        StageUpdate(status="done", note="Разобрано на площадке в NJ"),
    )
    cabinet_store.update_stage(
        deal.id,
        "ocean",
        StageUpdate(status="active", note="Контейнер в пути через Атлантику"),
    )

    done = cabinet_store.create_deal(
        DealCreate(
            telegram_id=telegram_id,
            title="2019 BMW X5 xDrive40i",
            vin="5UXCR6C05KL********",
            lot_number="UK-445512",
            note="Демо: Англия → порт → море → Беларусь → клиент (завершено).",
            status="completed",
            origin_region="uk",
            origin_point="port",
        )
    )
    for key, note in (
        ("selection", "Подобран на Copart UK"),
        ("auction", "Выигран"),
        ("origin", "Отгрузка из порта Southampton"),
        ("ocean", "Море пройдено"),
        ("belarus", "Таможня РБ закрыта"),
        ("delivery", "Выдан клиенту в Минске"),
    ):
        cabinet_store.update_stage(done.id, key, StageUpdate(status="done", note=note))  # type: ignore[arg-type]


@router.get("/config")
def auth_config(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    """Public auth flags for the cabinet UI."""
    from app.services.sms_by import is_configured

    return {
        "dev_enabled": bool(settings.cabinet_dev_auth),
        "sms_enabled": is_configured(),
        "register_enabled": True,
    }


@router.post("/register/send-code")
async def register_send_code(body: RegisterSendCodePayload) -> dict:
    """Send SMS OTP for self-registration."""
    try:
        phone = normalize_phone(body.phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    existing = cabinet_store.get_user_by_phone(phone)
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Аккаунт с этим телефоном уже есть — войдите по паролю",
        )

    ok, status, debug_code = await sms_otp.send_registration_code(phone)
    if not ok:
        raise HTTPException(status_code=400, detail=status)

    out: dict = {"ok": True, "phone": phone, "status": status}
    # Only expose code when SMS provider skipped (dev / not configured)
    if debug_code:
        out["debug_code"] = debug_code
        out["hint"] = "SMS не настроено на сервере — используйте debug_code"
    return out


@router.post("/register/confirm", response_model=AuthResponse)
async def register_confirm(
    body: RegisterConfirmPayload,
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthResponse:
    """Verify SMS code and create cabinet account."""
    try:
        phone = normalize_phone(body.phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    ok, err = sms_otp.verify_code(phone, body.code)
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    if not body.consent_privacy:
        raise HTTPException(
            status_code=422,
            detail="Нужно согласие с политикой конфиденциальности",
        )
    if not body.consent_service:
        raise HTTPException(
            status_code=422,
            detail="Нужно согласие на сервисные уведомления",
        )

    if cabinet_store.get_user_by_phone(phone):
        raise HTTPException(
            status_code=409,
            detail="Аккаунт с этим телефоном уже есть — войдите по паролю",
        )

    try:
        user = cabinet_store.create_client_account(
            phone=phone,
            password=body.password,
            first_name=body.first_name,
            last_name=body.last_name,
            manager_user_id=None,
            consent_marketing=bool(body.consent_marketing),
            consent_service=bool(body.consent_service),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    token = create_access_token(
        telegram_id=user.telegram_id,
        user_id=user.id,
        settings=settings,
    )
    return AuthResponse(access_token=token, user=user)


@router.get("/telegram/config")
def telegram_login_config(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    """Deprecated: Telegram Login Widget disabled — password only."""
    return {
        "bot_username": "",
        "enabled": False,
        "dev_enabled": bool(settings.cabinet_dev_auth),
    }


@router.post("/telegram", response_model=AuthResponse)
async def auth_telegram() -> AuthResponse:
    """Deprecated — use POST /auth/password."""
    raise HTTPException(
        status_code=410,
        detail="Вход через Telegram отключён. Используйте логин и пароль.",
    )


@router.post("/telegram/webapp", response_model=AuthResponse)
def auth_telegram_webapp() -> AuthResponse:
    """Deprecated — use POST /auth/password."""
    raise HTTPException(
        status_code=410,
        detail="Вход через Telegram отключён. Используйте логин и пароль.",
    )


def _secret_eq(left: str, right: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(left.encode("utf-8")).digest(),
        hashlib.sha256(right.encode("utf-8")).digest(),
    )


@router.post("/password", response_model=AuthResponse)
def auth_password(
    body: PasswordLoginPayload,
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthResponse:
    """Login: phone+password (клиент) or admin credentials for /admin/."""
    login = (body.login or "").strip()
    password = body.password or ""

    # 1) Client account: phone as login
    client = cabinet_store.authenticate_phone(login, password)
    if client is not None:
        token = create_access_token(
            telegram_id=client.telegram_id,
            user_id=client.id,
            settings=settings,
        )
        return AuthResponse(access_token=token, user=client)

    # 2) Legacy site admin password (settings env)
    expected_login = (settings.cabinet_admin_login or "").strip()
    expected_password = settings.cabinet_admin_password or ""
    if expected_login and expected_password and (
        _secret_eq(login, expected_login) and _secret_eq(password, expected_password)
    ):
        user = cabinet_store.upsert_user_from_telegram(
            {
                "telegram_id": int(settings.cabinet_password_telegram_id),
                "username": "admin",
                "first_name": "Администратор",
                "last_name": "",
                "photo_url": "",
            }
        )
        token = create_access_token(
            telegram_id=user.telegram_id,
            user_id=user.id,
            settings=settings,
        )
        return AuthResponse(access_token=token, user=user)

    raise HTTPException(status_code=401, detail="Неверный логин или пароль")


@router.post("/dev", response_model=AuthResponse)
def auth_dev(
    settings: Annotated[Settings, Depends(get_settings)],
    role: Annotated[DevRole, Query()] = "manager",
) -> AuthResponse:
    """Local test login — only when CABINET_DEV_AUTH=true.

    role=manager → admin cabinet (CABINET_DEV_TELEGRAM_ID)
    role=client  → ordinary user cabinet (CABINET_DEV_CLIENT_TELEGRAM_ID)
    """
    if not settings.cabinet_dev_auth:
        raise HTTPException(status_code=404, detail="Dev auth disabled")

    if role == "client":
        telegram_id = int(settings.cabinet_dev_client_telegram_id or DEV_CLIENT_TG_ID)
        profile = {
            "telegram_id": telegram_id,
            "username": "mg_client",
            "first_name": "Иван",
            "last_name": "Клиент",
            "photo_url": "",
        }
    else:
        telegram_id = int(settings.cabinet_dev_telegram_id or DEV_MANAGER_TG_ID)
        profile = {
            "telegram_id": telegram_id,
            "username": "mg_manager",
            "first_name": "Тест",
            "last_name": "Менеджер",
            "photo_url": "",
        }

    user = cabinet_store.upsert_user_from_telegram(profile)
    _ensure_demo_deals(telegram_id)
    user = cabinet_store.get_user_by_telegram_id(telegram_id) or user
    token = create_access_token(
        telegram_id=user.telegram_id,
        user_id=user.id,
        settings=settings,
    )
    return AuthResponse(access_token=token, user=user)
