from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.models.lots import AuctionLot
from app.services.auction_date import is_auction_ended


class LotStore:
    """In-memory lot catalog. Seeded from generated-lots.json; scrapers upsert here."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._by_id: dict[str, AuctionLot] = {}
        self._by_slug: dict[str, AuctionLot] = {}
        self.reload()

    def reload(self) -> int:
        path = Path(get_settings().lots_json_path)
        lots: list[AuctionLot] = []
        if path.is_file():
            raw = json.loads(path.read_text(encoding="utf-8"))
            items = raw.get("lots", raw) if isinstance(raw, dict) else raw
            for item in items or []:
                try:
                    lots.append(AuctionLot.model_validate(item))
                except Exception:
                    continue
        with self._lock:
            self._by_id = {lot.id: lot for lot in lots}
            self._by_slug = {lot.slug: lot for lot in lots}
        return len(lots)

    def all(self) -> list[AuctionLot]:
        with self._lock:
            return list(self._by_id.values())

    def ids(self) -> set[str]:
        with self._lock:
            return set(self._by_id.keys())

    def get_by_id(self, lot_id: str) -> AuctionLot | None:
        with self._lock:
            return self._by_id.get(lot_id)

    def get_by_slug(self, slug: str) -> AuctionLot | None:
        with self._lock:
            return self._by_slug.get(slug)

    def upsert(self, lot: AuctionLot) -> AuctionLot:
        with self._lock:
            old = self._by_id.get(lot.id)
            if old and old.slug != lot.slug:
                self._by_slug.pop(old.slug, None)
            self._by_id[lot.id] = lot
            self._by_slug[lot.slug] = lot
            return lot

    def upsert_many(self, lots: list[AuctionLot]) -> tuple[int, int]:
        """Returns (upserted_total, newly_added)."""
        new_count = 0
        with self._lock:
            for lot in lots:
                if lot.id not in self._by_id:
                    new_count += 1
                old = self._by_id.get(lot.id)
                if old and old.slug != lot.slug:
                    self._by_slug.pop(old.slug, None)
                self._by_id[lot.id] = lot
                self._by_slug[lot.slug] = lot
        return len(lots), new_count

    def delete(self, lot_id: str) -> bool:
        with self._lock:
            lot = self._by_id.pop(lot_id, None)
            if not lot:
                return False
            self._by_slug.pop(lot.slug, None)
            return True

    def prune_ended(self, *, grace_hours: float | None = None) -> int:
        """Remove lots whose auctionDate is in the past (plus grace). Returns deleted count."""
        settings = get_settings()
        if not settings.scraper_prune_ended:
            return 0
        hours = (
            settings.scraper_auction_grace_hours
            if grace_hours is None
            else grace_hours
        )
        now = datetime.now(timezone.utc)
        removed = 0
        with self._lock:
            to_drop = [
                lot.id
                for lot in self._by_id.values()
                if is_auction_ended(lot, now=now, grace_hours=hours)
            ]
            for lot_id in to_drop:
                lot = self._by_id.pop(lot_id, None)
                if lot:
                    self._by_slug.pop(lot.slug, None)
                    removed += 1
        return removed

    def persist(self, path: str | Path | None = None) -> int:
        out = Path(path or get_settings().lots_json_path)
        with self._lock:
            lots = [lot.model_dump(exclude_none=True) for lot in self._by_id.values()]
        lots.sort(key=lambda x: float(x.get("currentBid") or 0), reverse=True)
        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "mg-api-scraper",
            "counts": {
                "total": len(lots),
                "usa": sum(1 for l in lots if l.get("region") == "usa"),
                "uk": sum(1 for l in lots if l.get("region") == "uk"),
                "korea": sum(1 for l in lots if l.get("region") == "korea"),
                "china": sum(1 for l in lots if l.get("region") == "china"),
                "copart": sum(1 for l in lots if l.get("source") == "copart"),
                "iaai": sum(1 for l in lots if l.get("source") == "iaai"),
                "copart_uk": sum(1 for l in lots if l.get("source") == "copart_uk"),
                "manheim": sum(1 for l in lots if l.get("source") == "manheim"),
                "salvage_market": sum(1 for l in lots if l.get("source") == "salvage_market"),
                "encar": sum(1 for l in lots if l.get("source") == "encar"),
                "china_market": sum(1 for l in lots if l.get("source") == "china_market"),
            },
            "lots": lots,
        }
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_suffix(out.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(out)
        return len(lots)

    def __len__(self) -> int:
        with self._lock:
            return len(self._by_id)


lot_store = LotStore()

# Simple in-memory leads inbox (replace with DB later)
leads_inbox: list[dict] = []


def slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (value or "x").lower()).strip("-")
    return (s or "x")[:40]
