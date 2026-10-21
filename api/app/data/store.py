from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.models.lots import AuctionLot
from app.services.auction_date import is_auction_ended


_IAAI_LISTING_BLOB = re.compile(r"stock\s*#:|view all images|pre-?bid or buy now", re.I)


def _repair_iaai_blobs(lots: list[AuctionLot]) -> list[AuctionLot]:
    def _blob(lot: AuctionLot) -> bool:
        for value in (lot.primaryDamage, lot.model, lot.make):
            if len(value or "") >= 80 and _IAAI_LISTING_BLOB.search(value or ""):
                return True
        return False

    if not any(_blob(lot) for lot in lots):
        return lots
    try:
        from app.scraper.iaai import repair_iaai_listing_blob
    except Exception:
        return lots
    return [repair_iaai_listing_blob(lot) for lot in lots]


def _is_our_archived_url(url: str) -> bool:
    """Local `/api/lot-photos` or Cloudflare R2 CDN — keep across scrape upserts."""
    u = (url or "").strip()
    if not u:
        return False
    if u.startswith("/api/lot-photos/"):
        return True
    try:
        from app.services.lot_photos import is_our_photo

        return is_our_photo(u)
    except Exception:
        return ".r2.dev/" in u.lower() and "/lots/" in u.lower()


def _dedupe_urls(urls: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        u = (u or "").strip()
        if not u:
            continue
        # Keep http(s), local archive, and any already-known our CDN path.
        if not (
            u.startswith("http")
            or u.startswith("/api/lot-photos/")
            or _is_our_archived_url(u)
        ):
            continue
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


_JUNK_PHOTO = re.compile(
    r"bid\.cars/img/|/upd/map/|opineo|rating\.png|/contact/people/"
    r"|gstatic|googleusercontent|/logo|\bflag\b|sprite|\.svg(?:$|\?)",
    re.I,
)


def _keep_lot_photo(url: str) -> bool:
    u = (url or "").strip()
    if not u or _JUNK_PHOTO.search(u):
        return False
    if u.startswith("/api/lot-photos/"):
        return True
    if "bid.cars" in u.lower() or u.lower().endswith("bid.car") or "bid.car/" in u.lower():
        return bool(re.search(r"images\.bid\.cars|pluto\.bid\.car|cdn\.bid\.cars|mercury\.bid", u, re.I))
    return True


def _empty_field(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, bool):
        return False
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, (list, dict)) and not value:
        return True
    if isinstance(value, (int, float)) and value == 0:
        return True
    return False


def merge_lot(old: AuctionLot | None, new: AuctionLot) -> AuctionLot:
    """Merge upsert so list scrapes never wipe a richer photo gallery / Bid.cars estimate."""
    if old is None:
        return new

    data = new.model_dump()
    old_data = old.model_dump()

    # Thin search-card seeds must not wipe fields from a full detail crawl
    # (Estimated cost, VIN, engine, damage, …).
    for key, old_val in old_data.items():
        if key in {"imageUrl", "imageUrls", "photosEnrichedAt", "currentBid", "sold"}:
            continue
        new_val = data.get(key)
        if _empty_field(new_val) and not _empty_field(old_val):
            data[key] = old_val

    # Bid / buy-now: keep previous if new scrape has no price yet
    if (not new.currentBid or new.currentBid <= 0) and old.currentBid > 0:
        data["currentBid"] = old.currentBid
    if _empty_field(new.buyNowPrice) and not _empty_field(old.buyNowPrice):
        data["buyNowPrice"] = old.buyNowPrice

    old_imgs = [
        u
        for u in _dedupe_urls(list(old.imageUrls or []) + ([old.imageUrl] if old.imageUrl else []))
        if _keep_lot_photo(u)
    ]
    new_imgs = [
        u
        for u in _dedupe_urls(list(new.imageUrls or []) + ([new.imageUrl] if new.imageUrl else []))
        if _keep_lot_photo(u)
    ]
    old_ours = [u for u in old_imgs if _is_our_archived_url(u)]
    new_ours = [u for u in new_imgs if _is_our_archived_url(u)]

    # Archived photos (disk and/or R2) must survive CDN-only scrapes.
    # Prefer R2 CDN cover over `/api/lot-photos` so the site does not depend on Windows.
    def _prefer_cdn_first(urls: list[str]) -> list[str]:
        cdn = [u for u in urls if u.startswith("http") and _is_our_archived_url(u)]
        local = [u for u in urls if u.startswith("/api/lot-photos/")]
        rest = [u for u in urls if u not in cdn and u not in local]
        return _dedupe_urls(cdn + local + rest)

    if old_ours or new_ours:
        remotes = [
            u
            for u in (new_imgs + old_imgs)
            if u.startswith("http") and not _is_our_archived_url(u)
        ]
        merged = _prefer_cdn_first(old_ours + new_ours + remotes)
        data["imageUrls"] = merged
        data["imageUrl"] = merged[0] if merged else (new.imageUrl or old.imageUrl)
    elif len(old_imgs) > len(new_imgs):
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
    """In-memory lot catalog. Seeded from api/data/lots.json; scrapers upsert here."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._by_id: dict[str, AuctionLot] = {}
        self._by_slug: dict[str, AuctionLot] = {}
        self.revision = 0
        self.reload()

    def reload(self) -> int:
        path = Path(get_settings().lots_json_path)
        lots: list[AuctionLot] = []
        if path.is_file():
            try:
                # utf-8-sig: tolerate PowerShell Set-Content -Encoding UTF8 (BOM)
                raw = json.loads(path.read_text(encoding="utf-8-sig"))
            except json.JSONDecodeError:
                # Broken / empty file — start with empty catalog rather than crash API
                raw = {"lots": []}
            items = raw.get("lots", raw) if isinstance(raw, dict) else raw
            for item in items or []:
                try:
                    lots.append(AuctionLot.model_validate(item))
                except Exception:
                    continue
        lots = _repair_iaai_blobs(lots)
        with self._lock:
            self._by_id = {lot.id: lot for lot in lots}
            self._by_slug = {lot.slug: lot for lot in lots}
            self.revision += 1
        return len(lots)

    def similar_sold(self, lot: AuctionLot, *, limit: int = 8) -> list:
        """Same make/model already sold on Bid.cars. No extra page fetches."""
        from app.models.lots import SoldPeer

        make = (lot.make or "").strip().lower()
        model = (lot.model or "").strip().lower()
        if not make:
            return []
        scored: list[tuple[tuple, AuctionLot]] = []
        with self._lock:
            rows = list(self._by_id.values())
        for other in rows:
            if not getattr(other, "sold", False) or other.id == lot.id:
                continue
            if (other.make or "").strip().lower() != make:
                continue
            same_model = model and (other.model or "").strip().lower() == model
            if model and not same_model:
                continue
            year_delta = abs(int(other.year or 0) - int(lot.year or 0))
            scored.append(((year_delta, -(other.currentBid or 0)), other))
        scored.sort(key=lambda item: item[0])
        peers: list[SoldPeer] = []
        for _, other in scored[:limit]:
            peers.append(
                SoldPeer(
                    id=other.id,
                    slug=other.slug,
                    lotNumber=other.lotNumber,
                    year=other.year,
                    make=other.make,
                    model=other.model,
                    currentBid=other.currentBid,
                    currency=other.currency,
                    imageUrl=other.imageUrl or "",
                )
            )
        return peers

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

    def find_by_lot_number(
        self,
        lot_number: str,
        *,
        sources: set[str] | None = None,
    ) -> AuctionLot | None:
        """Lookup in production catalog by auction lot # (optional source filter)."""
        ln = (lot_number or "").strip()
        if not ln:
            return None
        with self._lock:
            matches = [
                lot
                for lot in self._by_id.values()
                if (lot.lotNumber or "").strip() == ln
                and (sources is None or lot.source in sources)
            ]
        if not matches:
            return None
        # Prefer lot with bid + photo
        matches.sort(
            key=lambda l: (
                1 if l.currentBid and l.currentBid > 0 else 0,
                1 if l.imageUrl else 0,
                l.year or 0,
            ),
            reverse=True,
        )
        return matches[0]

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
            self.revision += 1
            return merged

    def upsert_many(self, lots: list[AuctionLot]) -> tuple[int, int]:
        """Returns (upserted_total, newly_added)."""
        new_count = 0
        with self._lock:
            for lot in lots:
                _, is_new = self._upsert_locked(lot)
                if is_new:
                    new_count += 1
            if lots:
                self.revision += 1
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
            self.revision += 1
            return lot

    def delete(self, lot_id: str) -> bool:
        with self._lock:
            lot = self._by_id.pop(lot_id, None)
            if not lot:
                return False
            self._by_slug.pop(lot.slug, None)
            self.revision += 1
            return True

    def delete_region(self, region: str) -> int:
        """Drop every lot in a region. Returns how many were removed."""
        key = (region or "").strip().lower()
        if not key:
            return 0
        with self._lock:
            ids = [lot.id for lot in self._by_id.values() if (lot.region or "").lower() == key]
            for lot_id in ids:
                lot = self._by_id.pop(lot_id, None)
                if lot:
                    self._by_slug.pop(lot.slug, None)
            if ids:
                self.revision += 1
            return len(ids)

    def prune_ended(
        self,
        *,
        grace_hours: float | None = None,
        sources: set[str] | None = None,
    ) -> int:
        """Remove lots whose auctionDate is in the past (plus grace). Returns deleted count.

        If sources is set, only those auction sources are pruned (so a blocked
        Copart UK cycle does not wipe England kits while scrape is down).
        """
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
                if (sources is None or lot.source in sources)
                and is_auction_ended(lot, now=now, grace_hours=hours)
            ]
            for lot_id in to_drop:
                lot = self._by_id.pop(lot_id, None)
                if lot:
                    self._by_slug.pop(lot.slug, None)
                    removed += 1
            live_ids = set(self._by_id)
            if to_drop:
                self.revision += 1
        if to_drop:
            from app.services.lot_photos import delete_lot_photos, sweep_orphan_photos

            for lot_id in to_drop:
                delete_lot_photos(lot_id)
            sweep_orphan_photos(live_ids)
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
