from typing import Literal

from pydantic import BaseModel, Field


class LeadCreate(BaseModel):
    name: str | None = None
    phone: str | None = None
    messenger: str | None = None
    model: str | None = None
    origin: str | None = None
    budget: str | None = None
    timing: str | None = None
    body: str | None = None
    condition: str | None = None
    comment: str | None = None
    source: str = "website"
    page: str | None = None


class LeadResponse(BaseModel):
    id: str
    status: Literal["accepted"] = "accepted"
    message: str = "Заявка принята"


class QuoteRequest(BaseModel):
    region: Literal["usa", "uk"]
    bid: float = Field(gt=0)
    location: str | None = None
    category: str | None = None
    title: str | None = None
    body_style: str | None = None
    vat_on_sale: bool | None = None
    dismantle_type: str | None = None
    dismantle_kg: float | None = None
    inland_miles: float | None = None
    inland_usd: float | None = None
    volume: Literal["high", "standard"] = "standard"
    bid_method: Literal["live", "proxy"] = "live"
    include_america_delivery: bool = True
    fx_rate: float | None = None


class WeightPriceRequest(BaseModel):
    origin: Literal["usa", "uk"]
    kg: float = Field(gt=0)
