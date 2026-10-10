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
    "bidcars",
]
TitleType = Literal["clean", "salvage", "rebuilt", "parts_only"]
Currency = Literal["USD", "GBP", "KRW"]
OdometerUnit = Literal["mi", "km"]
CatalogTab = Literal["all", "passable", "open", "buy-now"]


class SoldPeer(BaseModel):
    """Sold Bid.cars card shown as a similar sale. Not scraped as a separate gallery."""

    id: str
    slug: str
    lotNumber: str = ""
    year: int = 0
    make: str = ""
    model: str = ""
    currentBid: float = 0
    currency: Currency = "USD"
    imageUrl: str = ""


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
    # Bid.cars "Estimated cost" range, e.g. $2,930 – $5,310
    estimatedCostMin: float | None = None
    estimatedCostMax: float | None = None
    engine: str | None = None
    bodyStyle: str | None = None
    category: str | None = None
    vatOnSale: bool | None = None
    inlandMiles: float | None = None
    weightKg: float | None = None
    lotUrl: str | None = None
    imageUrls: list[str] | None = None
    # ISO timestamp when gallery was fetched from lot detail page
    photosEnrichedAt: str | None = None
    # List endpoint may slim imageUrls to a cover; photoCount keeps the real gallery size.
    photoCount: int | None = None
    # Bid.cars archived sale. Kept for "похожие проданные", hidden from the live catalog.
    sold: bool = False
    similarSold: list[SoldPeer] | None = None


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


class TopMakeStat(BaseModel):
    make: str
    count: int
    min_bid: float = 0
    currency: str = "USD"


class LotMetaResponse(BaseModel):
    makes: list[str]
    models: list[str]
    sources: list[str]
    regions: list[str]
    damages: list[str]
    body_styles: list[str]
    fuels: list[str] = Field(default_factory=list)
    transmissions: list[str] = Field(default_factory=list)
    drives: list[str] = Field(default_factory=list)
    total: int
    counts_by_region: dict[str, int]
    counts_by_source: dict[str, int]
    top_makes: list[TopMakeStat] = Field(default_factory=list)
