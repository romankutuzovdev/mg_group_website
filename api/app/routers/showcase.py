"""Витрина на главной: «Выбор менеджеров» и «Купленные авто» из калькуляторов."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.cabinet import UserOut
from app.services import showcase_picks
from app.services.auth_deps import is_limited_manager, require_admin
from app.services.showcase_picks import ShowcasePickIn, ShowcasePickPatch

router = APIRouter(tags=["showcase"])

Staff = Annotated[UserOut, Depends(require_admin)]


def _manager_name(user: UserOut) -> str:
    name = " ".join(part for part in (user.first_name, user.last_name) if part).strip()
    return name or (f"@{user.username}" if user.username else f"TG {user.telegram_id}")


def _own_or_404(pick_id: int, user: UserOut) -> dict[str, Any]:
    pick = showcase_picks.get(pick_id)
    if not pick:
        raise HTTPException(status_code=404, detail="Не найдено")
    if is_limited_manager(user) and pick["manager_user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Это добавил другой менеджер")
    return pick


@router.get("/showcase")
def public_showcase(
    section: Literal["home", "bought"] = "home",
    kind: Literal["", "restoration", "kit"] = "",
    limit: int = Query(12, ge=1, le=48),
) -> dict[str, Any]:
    items = showcase_picks.list_public(section=section, kind=kind, limit=limit)
    return {"items": items, "count": len(items)}


@router.get("/showcase/{pick_id}")
def public_showcase_pick(pick_id: int) -> dict[str, Any]:
    pick = showcase_picks.get_public(pick_id)
    if not pick:
        raise HTTPException(status_code=404, detail="Не найдено")
    return pick


@router.get("/cabinet/showcase")
def staff_showcase(user: Staff) -> list[dict[str, Any]]:
    # Витрина общая: каждый менеджер видит всё, что добавили коллеги.
    return showcase_picks.list_all(manager_user_id=None)


@router.post("/cabinet/showcase")
def staff_save_pick(body: ShowcasePickIn, user: Staff) -> dict[str, Any]:
    if body.total_usd is None or body.total_usd <= 0:
        raise HTTPException(status_code=422, detail="Сначала посчитайте итог")
    return showcase_picks.upsert(body, manager_user_id=user.id, manager_name=_manager_name(user))


@router.patch("/cabinet/showcase/{pick_id}")
def staff_patch_pick(pick_id: int, body: ShowcasePickPatch, user: Staff) -> dict[str, Any]:
    _own_or_404(pick_id, user)
    pick = showcase_picks.patch(pick_id, body)
    if not pick:
        raise HTTPException(status_code=404, detail="Не найдено")
    return pick


@router.delete("/cabinet/showcase/{pick_id}")
def staff_delete_pick(pick_id: int, user: Staff) -> dict[str, bool]:
    _own_or_404(pick_id, user)
    showcase_picks.delete(pick_id)
    return {"ok": True}
