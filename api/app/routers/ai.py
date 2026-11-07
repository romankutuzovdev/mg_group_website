"""Public AI car picker. See app/services/ai_chat.py."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import get_settings
from app.data.store import lot_store
from app.services import ai_chat

router = APIRouter(prefix="/ai", tags=["ai"])

_STATUS_FOR_ERROR = {
    "ai_disabled": 503,
    "ai_unavailable": 502,
    "empty_message": 422,
    "rate_limited": 429,
    "daily_limit": 429,
}


class ChatMessage(BaseModel):
    role: str = Field(..., max_length=16)
    content: str = Field(..., max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=40)
    lot_slug: str | None = Field(None, max_length=200)


@router.get("/status")
def ai_status() -> dict:
    return {"enabled": ai_chat.is_enabled()}


@router.post("/chat")
async def ai_chat_endpoint(body: ChatRequest, request: Request) -> dict:
    settings = get_settings()
    if not ai_chat.is_enabled():
        raise HTTPException(status_code=503, detail="ai_disabled")
    ip = request.client.host if request.client else "unknown"
    blocked = ai_chat.rate_limiter.allow(
        ip,
        hourly=settings.ai_chat_ip_hourly_limit,
        daily=settings.ai_chat_daily_limit,
    )
    if blocked:
        raise HTTPException(status_code=429, detail=blocked)
    lot = lot_store.get_by_slug(body.lot_slug) if body.lot_slug else None
    try:
        return await ai_chat.chat(
            [m.model_dump() for m in body.messages],
            lambda filters, cheapest: lot_store.search_live(filters, cheapest_first=cheapest),
            current_lot=lot,
        )
    except ai_chat.AiChatError as exc:
        raise HTTPException(
            status_code=_STATUS_FOR_ERROR.get(exc.code, 502), detail=exc.code
        ) from exc
