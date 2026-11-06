"""Admin logistics: containers board, drag-assign deals, stage SMS to clients."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from app.models.cabinet import UserOut
from app.models.logistics import (
    ContainerAddDeal,
    ContainerCreate,
    ContainerMovePayload,
    ContainerMoveResult,
    ContainerOut,
    ContainerUpdate,
    LogisticsBoardOut,
    SmsLogOut,
    SmsLogRefreshResult,
    SmsTemplateCreate,
    SmsTemplateOut,
    SmsTemplateUpdate,
)
from app.services.auth_deps import require_full_admin_or_key
from app.services.logistics_store import logistics_store
from app.services.sms_by import SmsSendResult, check_sms, human_error, send_sms_queue

router = APIRouter(prefix="/admin/logistics", tags=["logistics"])


@router.get("/board", response_model=LogisticsBoardOut)
def logistics_board(
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
) -> LogisticsBoardOut:
    return LogisticsBoardOut(
        pool=logistics_store.list_pool(),
        containers=logistics_store.list_containers(),
        stages=logistics_store.stages_meta(),
        templates=logistics_store.list_templates(),
    )


@router.get("/containers", response_model=list[ContainerOut])
def list_containers(
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
) -> list[ContainerOut]:
    return logistics_store.list_containers()


@router.post("/containers", response_model=ContainerOut)
def create_container(
    body: ContainerCreate,
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
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
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
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
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
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
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
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
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
) -> ContainerOut:
    try:
        return logistics_store.remove_deal(container_id, deal_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Машина не в этом контейнере") from exc


@router.post("/containers/{container_id}/move", response_model=ContainerMoveResult)
async def move_container_stage(
    container_id: int,
    body: ContainerMovePayload,
    background_tasks: BackgroundTasks,
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
) -> ContainerMoveResult:
    """Change stage; SMS go out in background one-by-one with delay (no UI timeout)."""
    try:
        container = logistics_store.set_stage(container_id, body.stage)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Контейнер не найден") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    sms_skipped = 0
    recipients: list[str] = []
    jobs: list[tuple[str, str, int]] = []

    if not body.send_sms:
        return ContainerMoveResult(
            container=container,
            sms_sent=0,
            sms_failed=0,
            sms_skipped=0,
            sms_queued=0,
            recipients=[],
        )

    # One SMS per phone (if several cars of same client — personalize with first car or list)
    by_phone: dict[str, list] = {}
    for deal in container.deals:
        phone = (deal.client_phone or "").strip()
        if not phone:
            sms_skipped += 1
            # Journal row so the logist sees who did NOT get a message.
            logistics_store.log_sms(
                container_id=container.id,
                container_code=container.code,
                stage=container.stage,
                deal_ids=[deal.deal_id],
                cars=deal.title,
                client_name=deal.client_name,
                phone="",
                message="",
                status="skipped",
                error="Нет телефона клиента",
            )
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
        log_id = logistics_store.log_sms(
            container_id=container.id,
            container_code=container.code,
            stage=container.stage,
            deal_ids=[d.deal_id for d in deals],
            cars=cars or primary.title,
            client_name=primary.client_name,
            phone=phone,
            message=message,
        )
        jobs.append((phone, message, log_id))
        recipients.append(phone)

    if jobs:
        background_tasks.add_task(send_sms_queue, jobs, on_result=_record_sms_result)

    return ContainerMoveResult(
        container=container,
        sms_sent=0,
        sms_failed=0,
        sms_skipped=sms_skipped,
        sms_queued=len(jobs),
        recipients=recipients,
    )


def _record_sms_result(log_id: int, result: SmsSendResult) -> None:
    logistics_store.mark_sms_result(
        log_id,
        ok=result.ok,
        skipped=result.skipped,
        sms_id=result.sms_id,
        error=human_error(result.error or ""),
    )


@router.get("/sms-log", response_model=list[SmsLogOut])
def list_sms_log(
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
    container_id: int | None = Query(None, ge=1),
    limit: int = Query(200, ge=1, le=2000),
) -> list[SmsLogOut]:
    """Journal of stage-change SMS: queued → sent → delivered / failed / skipped."""
    return logistics_store.list_sms_log(container_id=container_id, limit=limit)


@router.post("/sms-log/refresh", response_model=SmsLogRefreshResult)
async def refresh_sms_log(
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
    container_id: int | None = Query(None, ge=1),
    limit: int = Query(200, ge=1, le=2000),
) -> SmsLogRefreshResult:
    """Ask SMS.BY (checkSMS) which sent messages were delivered, then return the journal."""
    pending = logistics_store.sms_log_pending_delivery(limit=100)
    checked = delivered = failed = 0
    for entry in pending:
        if entry.sms_id is None:
            continue
        res = await check_sms(entry.sms_id)
        checked += 1
        if res.ok and res.delivered_at:
            delivered += 1
            logistics_store.mark_sms_delivery(entry.id, delivered_at=res.delivered_at)
        elif res.ok:
            logistics_store.mark_sms_delivery(entry.id)
        elif res.error == "not_configured":
            break
        else:
            # Transient check error — keep "sent", remember why.
            logistics_store.mark_sms_delivery(entry.id, error=res.error)
    return SmsLogRefreshResult(
        checked=checked,
        delivered=delivered,
        failed=failed,
        entries=logistics_store.list_sms_log(container_id=container_id, limit=limit),
    )


@router.get("/sms-templates", response_model=list[SmsTemplateOut])
def list_sms_templates(
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
) -> list[SmsTemplateOut]:
    return logistics_store.list_templates()


@router.post("/sms-templates", response_model=SmsTemplateOut)
def create_sms_template(
    body: SmsTemplateCreate,
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
) -> SmsTemplateOut:
    return logistics_store.create_template(
        title=body.title, body=body.body, kind=body.kind
    )


@router.patch("/sms-templates/{template_id}", response_model=SmsTemplateOut)
def update_sms_template(
    template_id: int,
    body: SmsTemplateUpdate,
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
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
    _: Annotated[UserOut, Depends(require_full_admin_or_key)],
) -> dict[str, bool]:
    try:
        logistics_store.delete_template(template_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Шаблон не найден") from exc
    return {"deleted": True}
