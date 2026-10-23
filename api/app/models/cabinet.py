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

# Машинокомплект: аукцион → разборка → дорога до Беларуси.
KIT_STAGE_KEYS: tuple[StageKey, ...] = (
    "auction",
    "origin",
    "belarus",
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


def stage_keys_for_kind(kind: DealKind) -> tuple[StageKey, ...]:
    return KIT_STAGE_KEYS if kind == "kit" else STAGE_KEYS


def stage_label(key: StageKey, *, kind: DealKind, origin_point: OriginPoint) -> str:
    if kind == "kit":
        if key == "auction":
            return "Аукцион"
        if key == "origin":
            return "Разборка"
        if key == "belarus":
            return "Дорога до Беларуси"
    if key == "origin":
        return origin_stage_label(origin_point)
    return STAGE_LABELS[key]


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


class PasswordLoginPayload(BaseModel):
    login: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class RegisterSendCodePayload(BaseModel):
    phone: str = Field(..., min_length=7, max_length=40)


class RegisterConfirmPayload(BaseModel):
    phone: str = Field(..., min_length=7, max_length=40)
    code: str = Field(..., min_length=4, max_length=12)
    password: str = Field(..., min_length=4, max_length=64)
    first_name: str = Field("", max_length=80)
    last_name: str = Field("", max_length=80)
    consent_marketing: bool = False
    consent_service: bool = True
    consent_privacy: bool = False


class CreateClientAccountPayload(BaseModel):
    """Manager creates a cabinet login: phone = login, password set by manager."""

    phone: str = Field("", max_length=40)
    password: str = Field(..., min_length=4, max_length=64)
    first_name: str = Field("", max_length=80)
    last_name: str = Field("", max_length=80)
    send_sms: bool = True

    def normalized_phone(self) -> str:
        from app.services.passwords import normalize_phone

        raw = (self.phone or "").strip()
        if not raw:
            raise ValueError("Укажите телефон клиента")
        return normalize_phone(raw)


class ResetClientPasswordPayload(BaseModel):
    password: str = Field(..., min_length=4, max_length=64)
    send_sms: bool = True


class UserOut(BaseModel):
    id: int
    telegram_id: int
    username: str = ""
    first_name: str = ""
    last_name: str = ""
    photo_url: str = ""
    phone: str = ""
    is_admin: bool = False
    is_manager: bool = False
    # Менеджер, за которым закреплён клиент (аккаунт с телефоном).
    manager_user_id: int = 0
    consent_marketing: bool = False
    consent_service: bool = False
    created_at: str


class ClientAccountCreatedOut(BaseModel):
    user: UserOut
    phone: str
    password: str
    login: str
    sms_sent: bool = False
    sms_skipped: bool = False
    sms_error: str = ""


class DealFillMapSmsOut(BaseModel):
    """Result of manager SMS: fill dismantle map + new cabinet password."""

    deal_id: int
    car: str = ""
    phone: str = ""
    login: str = ""
    password: str = ""
    sms_sent: bool = False
    sms_skipped: bool = False
    sms_error: str = ""
    message: str = ""


class UserRoleUpdate(BaseModel):
    """Owner admin promotes or demotes a logged-in user to manager."""

    is_manager: bool


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


class DealSpecs(BaseModel):
    """Structured lot/vehicle fields from Bid.cars / Copart / IAAI (not free-text notes)."""

    location: str = ""
    odometer: str = ""
    category: str = ""
    body_style: str = ""
    engine: str = ""
    cylinders: str = ""
    fuel: str = ""
    transmission: str = ""
    drive: str = ""
    exterior_color: str = ""
    primary_damage: str = ""


class DealOut(BaseModel):
    id: int
    title: str
    vin: str = ""
    lot_number: str = ""
    lot_url: str = ""
    tracking_url: str = ""
    # Dropbox (or other) gallery of dismantle / разбор photos — kits.
    dismantle_photos_url: str = ""
    status: DealStatus
    note: str = ""
    price: float = 0
    currency: Literal["USD", "GBP"] = "USD"
    kind: DealKind = "kit"
    origin_region: OriginRegion = "usa"
    origin_point: OriginPoint = "dismantle"
    specs: DealSpecs = Field(default_factory=DealSpecs)
    client_telegram_id: int = 0
    client_name: str = ""
    client_username: str = ""
    manager_user_id: int = 0
    manager_telegram_id: int = 0
    manager_name: str = ""
    manager_username: str = ""
    payment_stage1_paid: bool = False
    payment_stage1_at: str | None = None
    payment_stage1_due: str | None = None
    payment_stage2_paid: bool = False
    payment_stage2_at: str | None = None
    payment_stage2_due: str | None = None
    created_at: str
    updated_at: str
    stages: list[DealStageOut] = Field(default_factory=list)
    media: list[DealMediaOut] = Field(default_factory=list)


class DealCreate(BaseModel):
    telegram_id: int
    title: str
    vin: str = ""
    lot_number: str = ""
    lot_url: str = ""
    tracking_url: str = ""
    dismantle_photos_url: str = ""
    note: str = ""
    price: float = 0
    currency: Literal["USD", "GBP"] = "USD"
    status: DealStatus = "active"
    kind: DealKind = "kit"
    origin_region: OriginRegion = "usa"
    # Ignored if kind is set — derived from kind on create.
    origin_point: OriginPoint | None = None
    specs: DealSpecs | None = None
    manager_user_id: int | None = None
    payment_stage1_due: str = ""
    payment_stage2_due: str = ""


class DealUpdate(BaseModel):
    title: str | None = None
    vin: str | None = None
    lot_number: str | None = None
    lot_url: str | None = None
    tracking_url: str | None = None
    dismantle_photos_url: str | None = None
    note: str | None = None
    price: float | None = None
    currency: Literal["USD", "GBP"] | None = None
    status: DealStatus | None = None
    kind: DealKind | None = None
    origin_region: OriginRegion | None = None
    origin_point: OriginPoint | None = None
    specs: DealSpecs | None = None
    manager_user_id: int | None = None
    payment_stage1_due: str | None = None
    payment_stage2_due: str | None = None


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
    name_en: str = ""
    qty: str = ""
    packing: str = ""
    note: str = ""
    is_note_only: bool = False


class DismantleMapColumns(BaseModel):
    qty: str = "Кол"
    qty_hint: str | None = None
    packing: str | None = "Доп упак"
    note: str = "Примечание"
    name_en: bool = False


class DismantleMapOut(BaseModel):
    deal_id: int
    title: str = "Карта разбора"
    variant: str = "uk"
    origin_region: str = "usa"
    vehicle_label: str = ""
    vehicle_header_hint: str = ""
    general_note: str = ""
    sections: list[str] = Field(default_factory=list)
    cells: list[DismantleCellOut] = Field(default_factory=list)
    columns: DismantleMapColumns = Field(default_factory=DismantleMapColumns)
    qty_choices: list[str] = Field(default_factory=list)
    updated_at: str | None = None
    completed: bool = False
    completed_at: str | None = None


class DismantleCellPatch(BaseModel):
    qty: str | None = None
    packing: str | None = None
    note: str | None = None


class DismantleMetaPatch(BaseModel):
    vehicle_label: str | None = None
    general_note: str | None = None
    completed: bool | None = None
