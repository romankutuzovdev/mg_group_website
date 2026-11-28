"""Canonical public URL and first-paint fields for an auction detail page."""

from pathlib import PurePosixPath
from urllib.parse import quote

from app.models.lots import AuctionLot

SITE_ORIGIN = "https://mg-group.by"


def is_public_lot_slug(slug: str) -> bool:
    return bool(
        slug and slug == slug.strip()
        and slug.lower() not in {".", "..", "__live__", "_next", "lots", "index.html"}
        and not any(c in "/\\?#" or ord(c) < 32 or ord(c) == 127 for c in slug)
        and PurePosixPath(slug).suffix.lower() not in {
            ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".html",
        }
    )


def lot_path(slug: str) -> str:
    return f"/auctions/{quote(slug, safe='')}/"


def lot_preview(lot: AuctionLot) -> dict[str, str]:
    name = " ".join(str(s) for s in (lot.year, lot.make, lot.model) if s)
    price_label = "Цена" if lot.region in {"korea", "china"} else "Текущая ставка"
    amount = lot.currentBid
    if amount <= 0 and lot.buyNowPrice and lot.buyNowPrice > 0:
        price_label, amount = "Цена выкупа", lot.buyNowPrice
    price = "Уточняется"
    if amount > 0:
        formatted = f"{amount:,.2f}".rstrip("0").rstrip(".").replace(",", " ").replace(".", ",")
        price = f"{formatted} {lot.currency}"
    status = "В каталоге"
    return {
        "name": name,
        "title": f"{name} — лот №{lot.lotNumber} | MG.GROUP",
        "description": f"Лот №{lot.lotNumber}. {name}. {price_label} — {price.lower() if amount <= 0 else price}. Статус — {status.lower()}.",
        "canonical": SITE_ORIGIN + lot_path(lot.slug),
        "number": lot.lotNumber,
        "priceLabel": price_label,
        "price": price,
        "status": status,
        "robots": "noindex, follow" if lot.id.startswith("demo-") else "index, follow",
    }
