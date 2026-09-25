from typing import Literal

from pydantic import BaseModel, Field


AuctionRegion = Literal["usa", "uk", "korea", "china"]
AuctionSource = Literal[
    "copart",
    "iaai",
    "copart_uk",
    "manheim",
    "salvage_market",
    "encar",
    "china_market",
]
TitleType = Literal["clean", "salvage", "rebuilt", "parts_only"]
Currency = Literal["USD", "GBP", "KRW"]
OdometerUnit = Literal["mi", "km"]
CatalogTab = Literal["all", "passable", "open", "buy-now"]


class AuctionLot(BaseModel):
    id: str
    slug: str
    region: AuctionRegion
    source: AuctionSource
    lotNumber: str
    vin: str = ""
    make: str
    model: str
    year: int
    titleType: TitleType = "salvage"
    titleLabel: str = ""
    primaryDamage: str = ""
    secondaryDamage: str | None = None
    odometer: int = 0
    odometerUnit: OdometerUnit = "mi"
    currentBid: float = 0
    buyNowPrice: float | None = None
    currency: Currency = "USD"
    location: str = ""
    auctionDate: str = ""
    imageUrl: str = ""
    transmission: str = ""
    fuel: str = ""
    drive: str = ""
    exteriorColor: str = ""
    hasKeys: bool = False
    runsDrives: bool = False
    estimatedRetail: float | None = None
    engine: str | None = None
    bodyStyle: str | None = None
    category: str | None = None
    vatOnSale: bool | None = None
    inlandMiles: float | None = None
    weightKg: float | None = None
    lotUrl: str | None = None
    imageUrls: list[str] | None = None


class LotListResponse(BaseModel):
    items: list[AuctionLot]
    total: int
    page: int
    page_size: int
    pages: int
    counts: dict[str, int] = Field(default_factory=dict)


class LotBulkUpsertResponse(BaseModel):
    upserted: int
    total: int
    persisted: int = 0


class LotMetaResponse(BaseModel):
    makes: list[str]
    models: list[str]
    sources: list[str]
    regions: list[str]
    damages: list[str]
    body_styles: list[str]
    total: int
    counts_by_region: dict[str, int]
    counts_by_source: dict[str, int]
