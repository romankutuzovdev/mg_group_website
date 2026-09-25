from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings, get_settings
from app.models.cabinet import (
    AuthResponse,
    DealCreate,
    DealUpdate,
    StageUpdate,
    TelegramAuthPayload,
    TelegramWebAppAuthPayload,
)
from app.services.auth_deps import create_access_token
from app.services.cabinet_store import cabinet_store
from app.services.telegram_auth import (
    verify_telegram_login,
    verify_telegram_webapp_init_data,
)

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


@router.get("/telegram/config")
def telegram_login_config(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    """Public bot username for the Telegram Login Widget."""
    return {
        "bot_username": settings.telegram_bot_username,
        "enabled": bool(settings.telegram_bot_token and settings.telegram_bot_username),
        "dev_enabled": bool(settings.cabinet_dev_auth),
    }


@router.post("/telegram", response_model=AuthResponse)
def auth_telegram(
    payload: TelegramAuthPayload,
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthResponse:
    verified = verify_telegram_login(
        payload.model_dump(),
        bot_token=settings.telegram_bot_token,
        max_age_seconds=settings.telegram_auth_max_age_seconds,
    )
    user = cabinet_store.upsert_user_from_telegram(verified)
    token = create_access_token(
        telegram_id=user.telegram_id,
        user_id=user.id,
        settings=settings,
    )
    return AuthResponse(access_token=token, user=user)


@router.post("/telegram/webapp", response_model=AuthResponse)
def auth_telegram_webapp(
    payload: TelegramWebAppAuthPayload,
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthResponse:
    """Silent login for Telegram Mini App via `WebApp.initData`."""
    verified = verify_telegram_webapp_init_data(
        payload.init_data,
        bot_token=settings.telegram_bot_token,
        max_age_seconds=settings.telegram_auth_max_age_seconds,
    )
    user = cabinet_store.upsert_user_from_telegram(verified)
    token = create_access_token(
        telegram_id=user.telegram_id,
        user_id=user.id,
        settings=settings,
    )
    return AuthResponse(access_token=token, user=user)


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
