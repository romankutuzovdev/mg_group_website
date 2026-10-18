"""Admin logistics: containers board, drag-assign deals, stage SMS to clients."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.models.cabinet import UserOut
from app.models.logistics import (
    ContainerAddDeal,
    ContainerCreate,
    ContainerMovePayload,
    ContainerMoveResult,
    ContainerOut,
    ContainerUpdate,
    LogisticsBoardOut,
    SmsTemplateCreate,
    SmsTemplateOut,
    SmsTemplateUpdate,
)
from app.services.auth_deps import require_admin_or_key
from app.services.logistics_store import logistics_store
from app.services.sms_by import send_sms

router = APIRouter(prefix="/admin/logistics", tags=["logistics"])


@router.get("/board", response_model=LogisticsBoardOut)
def logistics_board(
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> LogisticsBoardOut:
    return LogisticsBoardOut(
        pool=logistics_store.list_pool(),
        containers=logistics_store.list_containers(),
        stages=logistics_store.stages_meta(),
        templates=logistics_store.list_templates(),
    )


@router.get("/containers", response_model=list[ContainerOut])
def list_containers(
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> list[ContainerOut]:
    return logistics_store.list_containers()


@router.post("/containers", response_model=ContainerOut)
def create_container(
    body: ContainerCreate,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> ContainerOut:
    try:
        return logistics_store.create_container(
            code=body.code,
            title=body.title,
            stage=body.stage,
            note=body.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/containers/{container_id}", response_model=ContainerOut)
def update_container(
    container_id: int,
    body: ContainerUpdate,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> ContainerOut:
    try:
        return logistics_store.update_container(
            container_id,
            code=body.code,
            title=body.title,
            note=body.note,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Контейнер не найден") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/containers/{container_id}")
def delete_container(
    container_id: int,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> dict[str, bool]:
    try:
        logistics_store.delete_container(container_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Контейнер не найден") from exc
    return {"deleted": True}


@router.post("/containers/{container_id}/deals", response_model=ContainerOut)
def add_deal_to_container(
    container_id: int,
    body: ContainerAddDeal,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> ContainerOut:
    try:
        return logistics_store.add_deal(container_id, body.deal_id)
    except KeyError as exc:
        detail = "Не найдено"
        msg = str(exc)
        if "container" in msg:
            detail = "Контейнер не найден"
        elif "deal" in msg:
            detail = "Сделка не найдена"
        raise HTTPException(status_code=404, detail=detail) from exc


@router.delete(
    "/containers/{container_id}/deals/{deal_id}",
    response_model=ContainerOut,
)
def remove_deal_from_container(
    container_id: int,
    deal_id: int,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> ContainerOut:
    try:
        return logistics_store.remove_deal(container_id, deal_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Машина не в этом контейнере") from exc


@router.post("/containers/{container_id}/move", response_model=ContainerMoveResult)
async def move_container_stage(
    container_id: int,
    body: ContainerMovePayload,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> ContainerMoveResult:
    """Change stage and SMS every unique client phone in the container."""
    try:
        container = logistics_store.set_stage(container_id, body.stage)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Контейнер не найден") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    sms_sent = 0
    sms_failed = 0
    sms_skipped = 0
    recipients: list[str] = []

    if not body.send_sms:
        return ContainerMoveResult(
            container=container,
            sms_sent=0,
            sms_failed=0,
            sms_skipped=0,
            recipients=[],
        )

    # One SMS per phone (if several cars of same client — personalize with first car or list)
    by_phone: dict[str, list] = {}
    for deal in container.deals:
        phone = (deal.client_phone or "").strip()
        if not phone:
            sms_skipped += 1
            continue
        by_phone.setdefault(phone, []).append(deal)

    for phone, deals in by_phone.items():
        primary = deals[0]
        cars = ", ".join(d.title for d in deals[:3])
        if len(deals) > 3:
            cars += f" (+{len(deals) - 3})"
        message = logistics_store.render_message(
            body.message,
            container_code=container.code,
            stage=container.stage,
            car=cars or primary.title,
            client=primary.client_name,
        )
        result = await send_sms(phone, message)
        recipients.append(phone)
        if result.ok:
            sms_sent += 1
        elif result.skipped:
            sms_skipped += 1
        else:
            sms_failed += 1

    return ContainerMoveResult(
        container=container,
        sms_sent=sms_sent,
        sms_failed=sms_failed,
        sms_skipped=sms_skipped,
        recipients=recipients,
    )


@router.get("/sms-templates", response_model=list[SmsTemplateOut])
def list_sms_templates(
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> list[SmsTemplateOut]:
    return logistics_store.list_templates()


@router.post("/sms-templates", response_model=SmsTemplateOut)
def create_sms_template(
    body: SmsTemplateCreate,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> SmsTemplateOut:
    return logistics_store.create_template(
        title=body.title, body=body.body, kind=body.kind
    )


@router.patch("/sms-templates/{template_id}", response_model=SmsTemplateOut)
def update_sms_template(
    template_id: int,
    body: SmsTemplateUpdate,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> SmsTemplateOut:
    try:
        return logistics_store.update_template(
            template_id, title=body.title, body=body.body
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Шаблон не найден") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/sms-templates/{template_id}")
def delete_sms_template(
    template_id: int,
    _: Annotated[UserOut, Depends(require_admin_or_key)],
) -> dict[str, bool]:
    try:
        logistics_store.delete_template(template_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Шаблон не найден") from exc
    return {"deleted": True}
