"""Public live chat with managers. See app/services/support_chat.py."""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.services import support_chat

router = APIRouter(prefix="/support", tags=["support"])

_SESSION = re.compile(r"^[a-z0-9]{16,64}$")
_hits: dict[str, deque[float]] = defaultdict(deque)
_PER_MINUTE = 10


class SendRequest(BaseModel):
    session_id: str = Field(..., max_length=64)
    text: str = Field(..., min_length=1, max_length=support_chat.MAX_TEXT)
    page: str = Field("", max_length=200)


def _check_session(session_id: str) -> str:
    if not _SESSION.match(session_id or ""):
        raise HTTPException(status_code=400, detail="bad_session")
    return session_id


def _allow(ip: str) -> bool:
    now = time.monotonic()
    hits = _hits[ip]
    while hits and hits[0] <= now - 60:
        hits.popleft()
    if len(hits) >= _PER_MINUTE:
        return False
    hits.append(now)
    return True


@router.get("/status")
def status() -> dict:
    return {
        "enabled": support_chat.is_enabled(),
        "online": support_chat.is_online(),
        "greeting": support_chat.GREETING,
    }


@router.get("/messages")
def messages(session_id: str = Query(..., max_length=64)) -> dict:
    return {"messages": support_chat.list_messages(_check_session(session_id))}


@router.post("/send")
def send(body: SendRequest, request: Request, tasks: BackgroundTasks) -> dict:
    if not support_chat.is_enabled():
        raise HTTPException(status_code=503, detail="support_disabled")
    session_id = _check_session(body.session_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="empty_message")
    if not _allow(request.client.host if request.client else "unknown"):
        raise HTTPException(status_code=429, detail="rate_limited")
    message = support_chat.add_message(session_id, "user", text)
    tasks.add_task(support_chat.notify_managers, session_id, text, page=body.page.strip())
    return {"message": message}
