import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

QuoteCurrency = Literal["USD", "GBP", "EUR", "BYN"]


class QuoteShareLine(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    label: str = Field(min_length=1, max_length=160)
    amount: float = Field(ge=0, le=1_000_000_000)
    currency: QuoteCurrency = "USD"


class QuoteShareInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    kind: Literal["usa", "uk", "restoration", "customs"]
    title: str = Field(min_length=1, max_length=240)
    lot_url: str = Field(default="", max_length=2000)
    location: str = Field(default="", max_length=160)
    bid: float | None = Field(default=None, ge=0, le=1_000_000_000)
    currency: QuoteCurrency = "USD"
    total_usd: float = Field(gt=0, le=1_000_000_000)
    summary: str = Field(default="", max_length=1000)
    image_url: str = Field(default="", max_length=2000)
    image_urls: list[str] = Field(default_factory=list, max_length=200)
    breakdown: list[QuoteShareLine] = Field(default_factory=list, max_length=60)

    @field_validator("lot_url", "image_url")
    @classmethod
    def public_url(cls, value: str, info: ValidationInfo) -> str:
        if not value:
            return value
        if info.field_name == "image_url" and re.match(
            r"^/(?:api/lot-photos/|api/lot-image(?:\?|/)|auctions/lots/)", value
        ):
            return value
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("Укажите ссылку http или https")
        if parsed.username or parsed.password:
            raise ValueError("Ссылка не должна содержать логин или пароль")
        return value

    @field_validator("image_urls")
    @classmethod
    def public_image_urls(cls, values: list[str]) -> list[str]:
        out: list[str] = []
        for value in values:
            image = value.strip()
            if not image:
                continue
            if len(image) > 2000:
                raise ValueError("Ссылка на фото слишком длинная")
            if re.match(r"^/(?:api/lot-photos/|api/lot-image(?:\?|/)|auctions/lots/)", image):
                out.append(image)
                continue
            parsed = urlsplit(image)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                raise ValueError("Укажите ссылку http или https для фотографии")
            if parsed.username or parsed.password:
                raise ValueError("Ссылка на фото не должна содержать логин или пароль")
            out.append(image)
        return out


class QuoteShareOut(BaseModel):
    id: str
    created_at: str
    quote: QuoteShareInput
