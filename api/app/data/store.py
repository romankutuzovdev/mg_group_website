from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.models.lots import AuctionLot
from app.services.auction_date import is_auction_ended


def _dedupe_urls(urls: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        u = (u or "").strip()
        if not u or not u.startswith("http"):
            continue
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def merge_lot(old: AuctionLot | None, new: AuctionLot) -> AuctionLot:
    """Merge upsert so list scrapes never wipe a richer photo gallery."""
    if old is None:
        return new

    data = new.model_dump()
    old_imgs = _dedupe_urls(list(old.imageUrls or []) + ([old.imageUrl] if old.imageUrl else []))
    new_imgs = _dedupe_urls(list(new.imageUrls or []) + ([new.imageUrl] if new.imageUrl else []))

    if len(old_imgs) > len(new_imgs):
        merged = _dedupe_urls(old_imgs + new_imgs)
        data["imageUrls"] = merged
        data["imageUrl"] = merged[0] if merged else (new.imageUrl or old.imageUrl)
    elif len(new_imgs) > len(old_imgs):
        data["imageUrls"] = new_imgs
        data["imageUrl"] = new_imgs[0] if new_imgs else new.imageUrl
    else:
        merged = _dedupe_urls(old_imgs + new_imgs)
        if merged:
            data["imageUrls"] = merged
            data["imageUrl"] = merged[0]

    # Keep enrichment stamp unless the new lot brings a fresher one
    if old.photosEnrichedAt and not new.photosEnrichedAt:
        data["photosEnrichedAt"] = old.photosEnrichedAt
    elif new.photosEnrichedAt:
        data["photosEnrichedAt"] = new.photosEnrichedAt

    # Prefer existing lotUrl if new is empty
    if old.lotUrl and not new.lotUrl:
        data["lotUrl"] = old.lotUrl

    return AuctionLot.model_validate(data)


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

    def _find_alias_locked(self, lot: AuctionLot) -> AuctionLot | None:
        """Same auction lot under an old id (usa-123 vs usa-copart-123)."""
        existing = self._by_id.get(lot.id)
        if existing:
            return existing
        ln = (lot.lotNumber or "").strip()
        if not ln:
            return None
        for other in self._by_id.values():
            if other.source != lot.source:
                continue
            if (other.lotNumber or "").strip() != ln:
                continue
            if other.region != lot.region:
                continue
            return other
        return None

    def _upsert_locked(self, lot: AuctionLot) -> tuple[AuctionLot, bool]:
        """Returns (merged, is_new). Must be called with lock held."""
        old = self._find_alias_locked(lot)
        is_new = old is None
        # Collapse alias into the incoming canonical id
        if old is not None and old.id != lot.id:
            self._by_id.pop(old.id, None)
            if old.slug != lot.slug:
                self._by_slug.pop(old.slug, None)
        merged = merge_lot(old, lot)
        if old and old.slug != merged.slug:
            self._by_slug.pop(old.slug, None)
        self._by_id[merged.id] = merged
        self._by_slug[merged.slug] = merged
        return merged, is_new

    def upsert(self, lot: AuctionLot) -> AuctionLot:
        with self._lock:
            merged, _ = self._upsert_locked(lot)
            return merged

    def upsert_many(self, lots: list[AuctionLot]) -> tuple[int, int]:
        """Returns (upserted_total, newly_added)."""
        new_count = 0
        with self._lock:
            for lot in lots:
                _, is_new = self._upsert_locked(lot)
                if is_new:
                    new_count += 1
        return len(lots), new_count

    def update_photos(
        self,
        lot_id: str,
        image_urls: list[str],
        *,
        enriched_at: str | None = None,
    ) -> AuctionLot | None:
        """Replace gallery for one lot (used by photo enricher)."""
        urls = _dedupe_urls(image_urls)
        if not urls:
            return None
        with self._lock:
            old = self._by_id.get(lot_id)
            if not old:
                return None
            data = old.model_dump()
            data["imageUrls"] = urls
            data["imageUrl"] = urls[0]
            data["photosEnrichedAt"] = enriched_at or datetime.now(timezone.utc).isoformat()
            lot = AuctionLot.model_validate(data)
            self._by_id[lot.id] = lot
            self._by_slug[lot.slug] = lot
            return lot

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
