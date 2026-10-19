"""Logistics containers, stages and SMS templates."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.cabinet import DealKind, DealStatus, OriginRegion

ContainerStage = Literal[
    "loading",
    "departed",
    "ocean",
    "customs",
    "arrived",
    "unloading",
    "done",
]

CONTAINER_STAGES: tuple[ContainerStage, ...] = (
    "loading",
    "departed",
    "ocean",
    "customs",
    "arrived",
    "unloading",
    "done",
)

CONTAINER_STAGE_LABELS: dict[ContainerStage, str] = {
    "loading": "Загрузка",
    "departed": "Вышел в путь",
    "ocean": "В море",
    "customs": "Таможня",
    "arrived": "Прибыл в РБ",
    "unloading": "Разгрузка",
    "done": "Выдан",
}


def container_stage_label(stage: str) -> str:
    return CONTAINER_STAGE_LABELS.get(stage, stage)  # type: ignore[arg-type]


class LogisticsDealCard(BaseModel):
    deal_id: int
    title: str
    vin: str = ""
    lot_number: str = ""
    kind: DealKind = "kit"
    origin_region: OriginRegion = "usa"
    status: DealStatus = "active"
    client_name: str = ""
    client_phone: str = ""
    container_id: int | None = None
    cover_url: str = ""
    engine: str = ""
    primary_damage: str = ""


class ContainerOut(BaseModel):
    id: int
    code: str
    title: str = ""
    stage: ContainerStage
    stage_label: str
    note: str = ""
    created_at: str = ""
    updated_at: str = ""
    deals: list[LogisticsDealCard] = Field(default_factory=list)


class ContainerCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    title: str = Field("", max_length=120)
    stage: ContainerStage = "loading"
    note: str = Field("", max_length=500)


class ContainerUpdate(BaseModel):
    code: str | None = Field(None, min_length=1, max_length=64)
    title: str | None = Field(None, max_length=120)
    note: str | None = Field(None, max_length=500)


class ContainerAddDeal(BaseModel):
    deal_id: int


class ContainerMovePayload(BaseModel):
    """Change container stage and optionally SMS all clients in it."""

    stage: ContainerStage
    message: str = Field(..., min_length=1, max_length=700)
    send_sms: bool = True
    template_id: int | None = None


class ContainerMoveResult(BaseModel):
    container: ContainerOut
    sms_sent: int = 0
    sms_failed: int = 0
    sms_skipped: int = 0
    recipients: list[str] = Field(default_factory=list)


class SmsTemplateOut(BaseModel):
    id: int
    title: str
    body: str
    kind: str = "container_stage"
    created_at: str = ""
    updated_at: str = ""


class SmsTemplateCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=700)
    kind: str = Field("container_stage", max_length=40)


class SmsTemplateUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=120)
    body: str | None = Field(None, min_length=1, max_length=700)


class LogisticsBoardOut(BaseModel):
    pool: list[LogisticsDealCard]
    containers: list[ContainerOut]
    stages: list[dict[str, str]]
    templates: list[SmsTemplateOut]
