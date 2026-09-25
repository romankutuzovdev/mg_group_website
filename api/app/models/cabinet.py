from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

StageKey = Literal[
    "selection",
    "auction",
    "origin",
    "ocean",
    "belarus",
    "delivery",
]
OriginRegion = Literal["usa", "uk", "china", "korea"]
OriginPoint = Literal["dismantle", "port"]
DealKind = Literal["car", "kit"]  # авто | машинокомплект
StageStatus = Literal["pending", "active", "done"]
DealStatus = Literal["active", "completed", "cancelled"]
MediaKind = Literal["photo", "document"]

ORIGIN_REGION_LABELS: dict[OriginRegion, str] = {
    "usa": "США",
    "uk": "Англия",
    "china": "Китай",
    "korea": "Корея",
}


def origin_point_for_kind(kind: DealKind) -> OriginPoint:
    """Kits go through dismantle; whole cars ship from port."""
    return "dismantle" if kind == "kit" else "port"


def region_label(region: OriginRegion) -> str:
    return ORIGIN_REGION_LABELS.get(region, region)

STAGE_KEYS: tuple[StageKey, ...] = (
    "selection",
    "auction",
    "origin",
    "ocean",
    "belarus",
    "delivery",
)

# Stages shown on the interactive route map (after auction).
MAP_STAGE_KEYS: tuple[StageKey, ...] = (
    "origin",
    "ocean",
    "belarus",
    "delivery",
)

STAGE_LABELS: dict[StageKey, str] = {
    "selection": "Подбор лота",
    "auction": "Аукцион",
    "origin": "Локация",
    "ocean": "Море",
    "belarus": "Беларусь",
    "delivery": "Клиент",
}

# Legacy keys remapped on read / migrate
LEGACY_STAGE_MAP: dict[str, StageKey] = {
    "logistics_usa": "origin",
    "ocean_customs": "ocean",
}


def origin_stage_label(origin_point: OriginPoint) -> str:
    return "Разборка" if origin_point == "dismantle" else "Порт"


class TelegramAuthPayload(BaseModel):
    id: int
    first_name: str = ""
    last_name: str = ""
    username: str = ""
    photo_url: str = ""
    auth_date: int
    hash: str


class TelegramWebAppAuthPayload(BaseModel):
    """Raw `Telegram.WebApp.initData` query string from Mini App."""

    init_data: str = Field(..., min_length=1)


class UserOut(BaseModel):
    id: int
    telegram_id: int
    username: str = ""
    first_name: str = ""
    last_name: str = ""
    photo_url: str = ""
    is_admin: bool = False
    created_at: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class DealMediaOut(BaseModel):
    id: int
    deal_id: int
    stage_key: StageKey | None = None
    kind: MediaKind
    url: str
    filename: str = ""
    caption: str = ""
    created_at: str


class DealStageOut(BaseModel):
    key: StageKey
    label: str
    status: StageStatus
    note: str = ""
    updated_at: str | None = None


class DealOut(BaseModel):
    id: int
    title: str
    vin: str = ""
    lot_number: str = ""
    status: DealStatus
    note: str = ""
    price: float = 0
    currency: Literal["USD", "GBP"] = "USD"
    kind: DealKind = "kit"
    origin_region: OriginRegion = "usa"
    origin_point: OriginPoint = "dismantle"
    client_telegram_id: int = 0
    client_name: str = ""
    client_username: str = ""
    manager_telegram_id: int = 0
    payment_stage1_paid: bool = False
    payment_stage1_at: str | None = None
    payment_stage2_paid: bool = False
    payment_stage2_at: str | None = None
    created_at: str
    updated_at: str
    stages: list[DealStageOut] = Field(default_factory=list)
    media: list[DealMediaOut] = Field(default_factory=list)


class DealCreate(BaseModel):
    telegram_id: int
    title: str
    vin: str = ""
    lot_number: str = ""
    note: str = ""
    price: float = 0
    currency: Literal["USD", "GBP"] = "USD"
    status: DealStatus = "active"
    kind: DealKind = "kit"
    origin_region: OriginRegion = "usa"
    # Ignored if kind is set — derived from kind on create.
    origin_point: OriginPoint | None = None


class DealUpdate(BaseModel):
    title: str | None = None
    vin: str | None = None
    lot_number: str | None = None
    note: str | None = None
    price: float | None = None
    currency: Literal["USD", "GBP"] | None = None
    status: DealStatus | None = None
    kind: DealKind | None = None
    origin_region: OriginRegion | None = None
    origin_point: OriginPoint | None = None


class StageUpdate(BaseModel):
    status: StageStatus
    note: str = ""


class PaymentStageUpdate(BaseModel):
    """Manager marks payment stage 1 or 2 as closed (paid)."""

    stage: Literal[1, 2]
    paid: bool = True


class FavoriteCreate(BaseModel):
    lot_id: str = Field(..., min_length=1)


class FavoriteLotOut(BaseModel):
    lot_id: str
    slug: str
    title: str
    year: int = 0
    make: str = ""
    model: str = ""
    image_url: str = ""
    current_bid: float = 0
    currency: str = "USD"
    auction_date: str = ""
    region: str = ""
    source: str = ""
    created_at: str = ""


class DismantleCellOut(BaseModel):
    key: str
    num: int | None = None
    section: str = ""
    name: str
    qty: str = ""
    packing: str = ""
    note: str = ""
    is_note_only: bool = False


class DismantleMapOut(BaseModel):
    deal_id: int
    title: str = "Карта разбора"
    vehicle_label: str = ""
    vehicle_header_hint: str = ""
    sections: list[str] = Field(default_factory=list)
    cells: list[DismantleCellOut] = Field(default_factory=list)
    updated_at: str | None = None
    completed: bool = False
    completed_at: str | None = None


class DismantleCellPatch(BaseModel):
    qty: str | None = None
    packing: str | None = None
    note: str | None = None


class DismantleMetaPatch(BaseModel):
    vehicle_label: str | None = None
    completed: bool | None = None
