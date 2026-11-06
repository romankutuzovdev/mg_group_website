from __future__ import annotations

import json
import logging
import queue
import re
import sqlite3
import threading
import time
import uuid
import zlib
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.config import get_settings
from app.models.lots import AuctionLot
from app.services.auction_date import BIDCARS_RELIABLE_DATES_FROM, parse_auction_date
from app.services.filter_lots import LotFilters, _engine_liters, _odometer_miles

logger = logging.getLogger("mg.store")


_CHINA_DATE_KEEP = timedelta(days=7)
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

    # China has no auctions: the mapper dates each row now + 14 days, so a car
    # that leaves the site expires by itself. Move the date only when it runs
    # low; otherwise every rescrape would rewrite and re-sync the whole region.
    if new.source == "china_market":
        ends = parse_auction_date(old.auctionDate)
        if ends and ends - datetime.now(timezone.utc) > _CHINA_DATE_KEEP:
            data["auctionDate"] = old.auctionDate

    return AuctionLot.model_validate(data)


_COLUMNS = (
    "id", "slug", "region", "source", "lot_number", "make", "make_lc", "model", "model_lc",
    "year", "price", "buy_now", "odo_mi", "auction_date", "end_ts", "sold", "runs",
    "title_type", "damage", "damage_lc", "body", "body_lc", "fuel", "fuel_lc", "drive",
    "drive_lc", "trans", "trans_lc", "engine_l", "search_lc", "own_photo", "currency",
    "seq", "data",
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS lots (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL, region TEXT NOT NULL, source TEXT NOT NULL,
    lot_number TEXT NOT NULL, make TEXT NOT NULL, make_lc TEXT NOT NULL, model TEXT NOT NULL,
    model_lc TEXT NOT NULL, year INTEGER NOT NULL, price REAL NOT NULL, buy_now REAL,
    odo_mi INTEGER NOT NULL, auction_date TEXT NOT NULL, end_ts REAL, sold INTEGER NOT NULL,
    runs INTEGER NOT NULL, title_type TEXT NOT NULL, damage TEXT NOT NULL,
    damage_lc TEXT NOT NULL, body TEXT NOT NULL, body_lc TEXT NOT NULL, fuel TEXT NOT NULL,
    fuel_lc TEXT NOT NULL, drive TEXT NOT NULL, drive_lc TEXT NOT NULL, trans TEXT NOT NULL,
    trans_lc TEXT NOT NULL, engine_l REAL, search_lc TEXT NOT NULL, own_photo INTEGER NOT NULL,
    currency TEXT NOT NULL, seq INTEGER NOT NULL, data BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_lots_slug ON lots(slug);
CREATE INDEX IF NOT EXISTS ix_lots_seq ON lots(seq);
CREATE INDEX IF NOT EXISTS ix_lots_number ON lots(lot_number, source, region);
CREATE INDEX IF NOT EXISTS ix_lots_end ON lots(sold, end_ts);
CREATE INDEX IF NOT EXISTS ix_lots_date ON lots(sold, auction_date, end_ts, region, source);
CREATE INDEX IF NOT EXISTS ix_lots_region_date
    ON lots(region, sold, auction_date, end_ts, source);
CREATE INDEX IF NOT EXISTS ix_lots_region_price ON lots(region, sold, price, end_ts, source);
CREATE INDEX IF NOT EXISTS ix_lots_region_year ON lots(region, sold, year, end_ts, source);
CREATE INDEX IF NOT EXISTS ix_lots_make
    ON lots(make_lc, region, sold, auction_date, end_ts, source);
CREATE TABLE IF NOT EXISTS lot_tombstones (id TEXT PRIMARY KEY, seq INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_tombstones_seq ON lot_tombstones(seq);
CREATE TABLE IF NOT EXISTS lot_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

_UPSERT_SQL = (
    f"INSERT INTO lots ({', '.join(_COLUMNS)}) VALUES ({', '.join('?' for _ in _COLUMNS)}) "
    "ON CONFLICT(id) DO UPDATE SET "
    + ", ".join(f"{c}=excluded.{c}" for c in _COLUMNS if c != "id")
)

_SORT_COLUMNS = {"date": "auction_date", "price": "price", "year": "year"}
_COUNT_TTL = 20.0
_COUNT_CACHE_MAX = 512
_BIDCARS_TTL = 30.0
_READ_CHUNK = 2000


def _pack(lot: AuctionLot) -> bytes:
    return zlib.compress(lot.model_dump_json(exclude_none=True).encode("utf-8"), 1)


def _unpack(blob: bytes) -> AuctionLot:
    return AuctionLot.model_validate_json(zlib.decompress(blob))


def _spec(value: str | None) -> str:
    """Filter text for a spec field; the "no value" dash must never match."""
    text = (value or "").strip().lower()
    return "" if text == "—" else text


def _end_ts(lot: AuctionLot) -> float | None:
    """Moment the lot counts as ended; None means it never ends by date.

    Mirrors is_auction_ended, so catalog filters and pruning stay in SQL.
    """
    if lot.sold:
        return None
    dt = parse_auction_date(lot.auctionDate)
    if dt is None:
        return None
    if (lot.source or "") == "bidcars" and dt < BIDCARS_RELIABLE_DATES_FROM:
        return None
    return dt.timestamp()


def _row(lot: AuctionLot, seq: int, blob: bytes) -> tuple:
    make = lot.make or ""
    model = lot.model or ""
    body = lot.bodyStyle or ""
    damage = lot.primaryDamage or ""
    image = lot.imageUrl or ""
    return (
        lot.id, lot.slug, (lot.region or "").lower(), lot.source or "",
        (lot.lotNumber or "").strip(), make, make.strip().lower(), model, model.lower(),
        int(lot.year or 0), float(lot.currentBid or 0), lot.buyNowPrice, _odometer_miles(lot),
        lot.auctionDate or "", _end_ts(lot), int(bool(lot.sold)), int(bool(lot.runsDrives)),
        lot.titleType or "", damage, f"{damage}\n{lot.secondaryDamage or ''}".lower(),
        body, body.lower(), lot.fuel or "", _spec(lot.fuel), lot.drive or "", _spec(lot.drive),
        lot.transmission or "", _spec(lot.transmission), _engine_liters(lot),
        f"{make} {model} {lot.vin} {lot.lotNumber} {lot.year}".lower(),
        int(bool(image) and "bid.car" not in image), lot.currency or "USD", seq, blob,
    )


def _filter_sql(f: LotFilters) -> tuple[list[str], list]:
    """LotFilters as SQL. Same rules as filter_lots(), which stays for plain lists."""
    where: list[str] = []
    params: list = []

    def add(sql: str, *values) -> None:
        where.append(sql)
        params.extend(values)

    if f.region:
        add("region = ?", f.region)
    if f.q:
        add("instr(search_lc, ?) > 0", f.q.strip().lower())
    if f.make:
        add("make_lc = ?", f.make.strip().lower())
    if f.model:
        add("instr(model_lc, ?) > 0", f.model.strip().lower())
    if f.auctions:
        add(f"source IN ({', '.join('?' for _ in f.auctions)})", *f.auctions)
    if f.tab == "buy-now":
        add("buy_now > 0")
    elif f.tab == "passable":
        add("runs = 1")
    elif f.tab == "open":
        add("title_type = 'clean'")
    if f.year_from is not None:
        add("year >= ?", f.year_from)
    if f.year_to is not None:
        add("year <= ?", f.year_to)
    if f.price_min is not None:
        add("price >= ?", f.price_min)
    if f.price_max is not None:
        add("price <= ?", f.price_max)
    if f.mileage_max is not None:
        add("odo_mi <= ?", f.mileage_max)
    if f.body:
        needle = f.body.strip().lower()
        add("(instr(body_lc, ?) > 0 OR instr(model_lc, ?) > 0)", needle, needle)
    if f.damage:
        add("instr(damage_lc, ?) > 0", f.damage.strip().lower())
    if f.run:
        add("runs = 1")
    if f.buynow:
        add("buy_now > 0")
    if f.eng_min is not None:
        add("engine_l >= ?", f.eng_min)
    if f.eng_max is not None:
        add("engine_l <= ?", f.eng_max)
    for column, value in (("fuel_lc", f.fuel), ("drive_lc", f.drive), ("trans_lc", f.trans)):
        if value:
            add(f"({column} <> '' AND instr({column}, ?) > 0)", value.strip().lower())
    return where, params


class LotStore:
    """Lot catalog in SQLite (lots.db next to lots.json).

    Lots live on disk, so RAM no longer grows with the catalog. Filter columns
    are real columns; the full lot is a compressed JSON blob. Every write takes
    a new `seq`, and deletes leave a tombstone: that is the change feed the
    scraper node sends to the public node.
    """

    def __init__(self, db_path: str | None = None) -> None:
        self._lock = threading.RLock()
        self._photo_cleanup: queue.Queue[list[str]] = queue.Queue()
        self._photo_cleanup_guard = threading.Lock()
        self._photo_cleanup_thread: threading.Thread | None = None
        self._local = threading.local()
        self._tx_depth = 0
        self._tx_owner: int | None = None
        self._count_cache: dict[tuple, tuple[float, dict[str, int]]] = {}
        self._bidcars_live: tuple[float, bool] = (0.0, False)
        self.revision = 0
        self._path = db_path or str(Path(get_settings().lots_json_path).with_suffix(".db"))
        self._memory = self._path == ":memory:"
        if not self._memory:
            Path(self._path).parent.mkdir(parents=True, exist_ok=True)
        self._w = sqlite3.connect(
            self._path, check_same_thread=False, isolation_level=None, timeout=30
        )
        if not self._memory:
            self._w.execute("PRAGMA journal_mode=WAL")
        self._w.execute("PRAGMA synchronous=NORMAL")
        self._w.executescript(_SCHEMA)
        self._seq = int(
            self._w.execute(
                "SELECT MAX(s) FROM (SELECT COALESCE(MAX(seq), 0) s FROM lots "
                "UNION ALL SELECT COALESCE(MAX(seq), 0) FROM lot_tombstones)"
            ).fetchone()[0]
        )
        self._count = int(self._w.execute("SELECT COUNT(*) FROM lots").fetchone()[0])
        self.catalog_id = self.get_meta("catalog_id")
        if not self.catalog_id:
            self.catalog_id = uuid.uuid4().hex
            self.set_meta("catalog_id", self.catalog_id)
        self.reload()

    # ---- connections -------------------------------------------------------

    def _reader(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self._path, isolation_level=None, timeout=30)
            conn.execute("PRAGMA query_only=ON")
            conn.execute("PRAGMA cache_size=-4000")
            self._local.conn = conn
        return conn

    def _fetch(self, sql: str, params: Iterable = ()) -> list[tuple]:
        # Inside a transaction, read through it: a reader would miss its writes.
        if self._memory or self._tx_owner == threading.get_ident():
            with self._lock:
                return self._w.execute(sql, tuple(params)).fetchall()
        return self._reader().execute(sql, tuple(params)).fetchall()

    @contextmanager
    def _tx(self) -> Iterator[None]:
        with self._lock:
            outer = self._tx_depth == 0
            if outer:
                self._w.execute("BEGIN IMMEDIATE")
                self._tx_owner = threading.get_ident()
            self._tx_depth += 1
            try:
                yield
            except BaseException:
                self._tx_depth -= 1
                if outer:
                    self._tx_owner = None
                    self._w.execute("ROLLBACK")
                    self._count = int(self._w.execute("SELECT COUNT(*) FROM lots").fetchone()[0])
                raise
            self._tx_depth -= 1
            if outer:
                self._tx_owner = None
                self._w.execute("COMMIT")

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    @property
    def seq(self) -> int:
        return self._seq

    def get_meta(self, key: str) -> str:
        row = self._fetch("SELECT value FROM lot_meta WHERE key = ?", (key,))
        return row[0][0] if row else ""

    def set_meta(self, key: str, value: str) -> None:
        with self._lock:
            self._w.execute(
                "INSERT INTO lot_meta (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    # ---- one-time import ---------------------------------------------------

    def reload(self) -> int:
        """Import lots.json into an empty database once; afterwards a no-op."""
        path = Path(get_settings().lots_json_path)
        if self._count or self._memory or self.get_meta("json_imported") or not path.is_file():
            return self._count
        try:
            # utf-8-sig: tolerate PowerShell Set-Content -Encoding UTF8 (BOM)
            raw = json.loads(path.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError:
            # Broken / empty file: start with an empty catalog rather than crash the API.
            logger.warning("lots.json is not valid JSON, starting with an empty catalog")
            return 0
        items = raw.get("lots", raw) if isinstance(raw, dict) else raw
        del raw
        if not isinstance(items, list):
            return 0
        # Pop as we go: raw dicts and models must not both sit in RAM at full size.
        items.reverse()
        while items:
            batch: list[AuctionLot] = []
            while items and len(batch) < _READ_CHUNK:
                try:
                    batch.append(AuctionLot.model_validate(items.pop()))
                except Exception:
                    continue
            with self._tx():
                for lot in _repair_iaai_blobs(batch):
                    self._write(lot)
        self.set_meta("json_imported", datetime.now(timezone.utc).isoformat())
        self.revision += 1
        logger.info("imported %s lots from %s", self._count, path)
        return self._count

    # ---- reads -------------------------------------------------------------

    def get_by_id(self, lot_id: str) -> AuctionLot | None:
        rows = self._fetch("SELECT data FROM lots WHERE id = ?", (lot_id,))
        return _unpack(rows[0][0]) if rows else None

    def get_by_slug(self, slug: str) -> AuctionLot | None:
        rows = self._fetch(
            "SELECT data FROM lots WHERE slug = ? ORDER BY seq DESC LIMIT 1", (slug,)
        )
        return _unpack(rows[0][0]) if rows else None

    def __contains__(self, lot_id: str) -> bool:
        return bool(self._fetch("SELECT 1 FROM lots WHERE id = ?", (lot_id,)))

    def ids(self, where: str = "1", params: Iterable = ()) -> set[str]:
        return {row[0] for row in self._fetch(f"SELECT id FROM lots WHERE {where}", params)}

    def iter_where(self, where: str = "1", params: Iterable = ()) -> Iterator[AuctionLot]:
        """Stream matching lots in chunks. Never holds the catalog in RAM.

        Each chunk is its own query, so writes are not blocked in between and
        the generator may be resumed from another thread.
        """
        values = tuple(params)
        last = 0
        while True:
            rows = self._fetch(
                f"SELECT rowid, data FROM lots WHERE rowid > ? AND ({where}) "
                "ORDER BY rowid LIMIT ?",
                (last, *values, _READ_CHUNK),
            )
            if not rows:
                return
            for _, blob in rows:
                yield _unpack(blob)
            last = rows[-1][0]

    def iter_all(self) -> Iterator[AuctionLot]:
        return self.iter_where()

    def iter_ordered(
        self, where: str, params: Iterable = (), *, order: str
    ) -> Iterator[AuctionLot]:
        """Stream matching lots in `order`; only ids are held in RAM."""
        ids = [
            row[0]
            for row in self._fetch(f"SELECT id FROM lots WHERE {where} ORDER BY {order}", params)
        ]
        for start in range(0, len(ids), 500):
            chunk = ids[start : start + 500]
            marks = ", ".join("?" for _ in chunk)
            rows = dict(self._fetch(f"SELECT id, data FROM lots WHERE id IN ({marks})", chunk))
            for lot_id in chunk:
                blob = rows.get(lot_id)
                if blob is not None:
                    yield _unpack(blob)

    def similar_sold(self, lot: AuctionLot, *, limit: int = 8) -> list:
        """Same make/model already sold on Bid.cars. No extra page fetches."""
        from app.models.lots import SoldPeer

        make = (lot.make or "").strip().lower()
        model = (lot.model or "").strip().lower()
        if not make:
            return []
        where = "make_lc = ? AND sold = 1 AND id <> ?"
        params: list = [make, lot.id]
        if model:
            where += " AND trim(model_lc) = ?"
            params.append(model)
        scored = [
            ((abs(int(other.year or 0) - int(lot.year or 0)), -(other.currentBid or 0)), other)
            for other in self.iter_ordered(where, params, order="id")
        ]
        scored.sort(key=lambda item: item[0])
        return [
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
            for _, other in scored[:limit]
        ]

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
        matches = [
            lot
            for lot in self.iter_ordered("lot_number = ?", (ln,), order="id")
            if sources is None or lot.source in sources
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

    # ---- catalog queries ---------------------------------------------------

    def _live_sql(self) -> tuple[list[str], list]:
        """What the public catalog shows: not sold, not ended, no Bid.cars duplicates."""
        settings = get_settings()
        where = ["sold = 0"]
        params: list = []
        if settings.scraper_prune_ended:
            # Whole minutes: keeps the count cache key stable between requests.
            now = int(time.time() // 60 * 60)
            where.append("(end_ts IS NULL OR end_ts >= ?)")
            params.append(now - max(0.0, settings.scraper_auction_grace_hours) * 3600)
        checked_at, has_bidcars = self._bidcars_live
        if time.monotonic() - checked_at >= _BIDCARS_TTL or not checked_at:
            has_bidcars = bool(
                self._fetch(
                    "SELECT 1 FROM lots WHERE region = 'usa' AND sold = 0 AND source = 'bidcars' "
                    f"AND {where[-1] if len(where) > 1 else '1'} LIMIT 1",
                    params,
                )
            )
            self._bidcars_live = (time.monotonic(), has_bidcars)
        if has_bidcars:
            where.append("NOT (region = 'usa' AND source IN ('copart', 'iaai'))")
        return where, params

    def _region_counts(self, where_sql: str, params: list) -> dict[str, int]:
        key = (where_sql, tuple(params))
        now = time.monotonic()
        hit = self._count_cache.get(key)
        if hit and now - hit[0] < _COUNT_TTL:
            return hit[1]
        counts = dict(
            self._fetch(f"SELECT region, COUNT(*) FROM lots WHERE {where_sql} GROUP BY region", params)
        )
        if len(self._count_cache) >= _COUNT_CACHE_MAX:
            self._count_cache.clear()
        self._count_cache[key] = (now, counts)
        return counts

    def query_lots(
        self,
        filters: LotFilters,
        *,
        sort: str = "date",
        order: str = "desc",
        limit: int = 24,
        offset: int = 0,
        own_photo: bool = False,
    ) -> tuple[list[AuctionLot], int, dict[str, int]]:
        """One catalog page: (lots, total, counts by region)."""
        where, params = self._live_sql()
        extra, extra_params = _filter_sql(filters)
        where += extra
        params += extra_params
        if own_photo:
            where.append("own_photo = 1")
        where_sql = " AND ".join(where)
        counts = self._region_counts(where_sql, params)
        direction = "DESC" if order == "desc" else "ASC"
        rows = self._fetch(
            f"SELECT data FROM lots WHERE {where_sql} "
            f"ORDER BY {_SORT_COLUMNS[sort]} {direction}, id {direction} LIMIT ? OFFSET ?",
            (*params, limit, offset),
        )
        return [_unpack(row[0]) for row in rows], sum(counts.values()), counts

    def search_live(
        self, filters: LotFilters, *, limit: int = 5000, cheapest_first: bool = False
    ) -> list[AuctionLot]:
        """Top live lots for filters: newest first, or cheapest for a price cap."""
        where, params = self._live_sql()
        extra, extra_params = _filter_sql(filters)
        rows = self._fetch(
            f"SELECT data FROM lots WHERE {' AND '.join(where + extra)} "
            f"ORDER BY {'price ASC, year DESC' if cheapest_first else 'year DESC, price ASC'}, id "
            "LIMIT ?",
            (*params, *extra_params, limit),
        )
        return [_unpack(row[0]) for row in rows]

    def closest_to_now(self, limit: int) -> list[AuctionLot]:
        """Live lots whose auction is nearest to the current moment."""
        where, params = self._live_sql()
        where_sql = " AND ".join(where)
        now = time.time()
        ahead = self._fetch(
            f"SELECT end_ts, data FROM lots WHERE {where_sql} AND end_ts >= ? "
            "ORDER BY end_ts ASC LIMIT ?",
            (*params, now, limit),
        )
        behind = self._fetch(
            f"SELECT end_ts, data FROM lots WHERE {where_sql} AND end_ts < ? "
            "ORDER BY end_ts DESC LIMIT ?",
            (*params, now, limit),
        )
        rows = sorted(ahead + behind, key=lambda row: abs(row[0] - now))[:limit]
        if len(rows) < limit:
            rows += self._fetch(
                f"SELECT end_ts, data FROM lots WHERE {where_sql} AND end_ts IS NULL LIMIT ?",
                (*params, limit - len(rows)),
            )
        return [_unpack(row[1]) for row in rows]

    def facet_counts(self) -> dict[str, int]:
        return dict(self._fetch("SELECT region, COUNT(*) FROM lots GROUP BY region"))

    def facets(self, region: str | None = None) -> list[tuple]:
        """Distinct filter values with counts, for /lots/meta. One pass over the catalog."""
        where, params = self._live_sql()
        if region:
            where.append("region = ?")
            params.append(region)
        columns = "make, model, source, region, damage, body, fuel, trans, drive, currency"
        return self._fetch(
            f"SELECT {columns}, COUNT(*), MIN(CASE WHEN price > 0 THEN price END) "
            f"FROM lots WHERE {' AND '.join(where)} GROUP BY {columns}",
            params,
        )

    # ---- writes ------------------------------------------------------------

    def _write(self, lot: AuctionLot, blob: bytes | None = None) -> None:
        """Insert or replace one lot. Caller holds a transaction."""
        blob = blob if blob is not None else _pack(lot)
        known = self._w.execute("SELECT 1 FROM lots WHERE id = ?", (lot.id,)).fetchone()
        self._w.execute(_UPSERT_SQL, _row(lot, self._next_seq(), blob))
        self._w.execute("DELETE FROM lot_tombstones WHERE id = ?", (lot.id,))
        if not known:
            self._count += 1

    def _remove(self, lot_id: str) -> bool:
        """Delete one lot and leave a tombstone. Caller holds a transaction."""
        gone = self._w.execute("DELETE FROM lots WHERE id = ?", (lot_id,)).rowcount
        if not gone:
            return False
        self._count -= 1
        self._w.execute(
            "INSERT INTO lot_tombstones (id, seq) VALUES (?, ?) "
            "ON CONFLICT(id) DO UPDATE SET seq = excluded.seq",
            (lot_id, self._next_seq()),
        )
        return True

    def _find_alias(self, lot: AuctionLot) -> tuple[str, bytes] | None:
        """Same auction lot, possibly under an old id (usa-123 vs usa-copart-123)."""
        row = self._w.execute("SELECT id, data FROM lots WHERE id = ?", (lot.id,)).fetchone()
        if row:
            return row
        ln = (lot.lotNumber or "").strip()
        if not ln:
            return None
        return self._w.execute(
            "SELECT id, data FROM lots WHERE lot_number = ? AND source = ? AND region = ? LIMIT 1",
            (ln, lot.source, (lot.region or "").lower()),
        ).fetchone()

    def _upsert_one(self, lot: AuctionLot) -> tuple[AuctionLot, bool, bool]:
        """Returns (merged, is_new, changed). Caller holds a transaction."""
        found = self._find_alias(lot)
        if found is None:
            self._write(lot)
            return lot, True, True
        old_id, old_blob = found
        merged = merge_lot(_unpack(old_blob), lot)
        blob = _pack(merged)
        # An unchanged lot keeps its seq, so a rescrape sends nothing to the VPS.
        if blob == old_blob and old_id == merged.id:
            return merged, False, False
        # Collapse alias into the incoming canonical id
        if old_id != merged.id:
            self._remove(old_id)
        self._write(merged, blob)
        return merged, False, True

    def upsert(self, lot: AuctionLot) -> AuctionLot:
        with self._tx():
            merged, _, changed = self._upsert_one(lot)
        if changed:
            self.revision += 1
        return merged

    def upsert_many(self, lots: list[AuctionLot]) -> tuple[int, int]:
        """Returns (upserted_total, newly_added)."""
        new_count = 0
        any_change = False
        with self._tx():
            for lot in lots:
                _, is_new, changed = self._upsert_one(lot)
                new_count += int(is_new)
                any_change = any_change or changed
        if any_change:
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
        with self._tx():
            row = self._w.execute("SELECT data FROM lots WHERE id = ?", (lot_id,)).fetchone()
            if not row:
                return None
            data = _unpack(row[0]).model_dump()
            data["imageUrls"] = urls
            data["imageUrl"] = urls[0]
            data["photosEnrichedAt"] = enriched_at or datetime.now(timezone.utc).isoformat()
            lot = AuctionLot.model_validate(data)
            self._write(lot)
        self.revision += 1
        return lot

    def delete(self, lot_id: str) -> bool:
        with self._tx():
            removed = self._remove(lot_id)
        if not removed:
            return False
        self.revision += 1
        from app.services.lot_photos import delete_lot_photos

        delete_lot_photos(lot_id)
        return True

    def delete_region(self, region: str) -> int:
        """Drop every lot in a region. Returns how many were removed."""
        key = (region or "").strip().lower()
        if not key:
            return 0
        ids = self.ids("region = ?", (key,))
        with self._tx():
            for lot_id in ids:
                self._remove(lot_id)
        if ids:
            self.revision += 1
            from app.services.lot_photos import delete_lot_photos

            for lot_id in ids:
                delete_lot_photos(lot_id)
        return len(ids)

    def release_sold_photo_archives(self) -> int:
        """Keep sold-history records but remove their archived galleries.

        Bid.cars sold rows are useful for comparable-sale prices, but their
        full local/R2 galleries should not consume storage after the auction.
        Remote source covers are retained when available.
        """
        released: list[str] = []
        for lot in self.iter_where("sold = 1"):
            urls = _dedupe_urls(
                list(lot.imageUrls or []) + ([lot.imageUrl] if lot.imageUrl else [])
            )
            if not any(_is_our_archived_url(url) for url in urls):
                continue
            remotes = [url for url in urls if not _is_our_archived_url(url)]
            data = lot.model_dump()
            data["imageUrls"] = remotes or None
            data["imageUrl"] = remotes[0] if remotes else ""
            data["photoCount"] = len(remotes)
            data["photosEnrichedAt"] = None
            updated = AuctionLot.model_validate(data)
            with self._tx():
                self._write(updated)
            released.append(updated.id)

        if released:
            self.revision += 1
            from app.services.lot_photos import delete_lot_photos

            for lot_id in released:
                delete_lot_photos(lot_id)
        return len(released)

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
        cutoff = time.time() - max(0.0, hours) * 3600
        where = "sold = 0 AND end_ts < ?"
        params: list = [cutoff]
        if sources is not None:
            where += f" AND source IN ({', '.join('?' for _ in sources)})"
            params += sorted(sources)
        to_drop = list(self.ids(where, params))
        with self._tx():
            for lot_id in to_drop:
                self._remove(lot_id)
        if to_drop:
            self.revision += 1
            self._queue_photo_cleanup(to_drop)
        return len(to_drop)

    def _queue_photo_cleanup(self, lot_ids: list[str]) -> None:
        """Delete galleries on a background thread.

        Each lot is a network round trip to R2. Thousands of ended lots done
        inline froze the API and the scrapers, which share its event loop.
        """
        self._photo_cleanup.put(list(lot_ids))
        with self._photo_cleanup_guard:
            if self._photo_cleanup_thread is None or not self._photo_cleanup_thread.is_alive():
                self._photo_cleanup_thread = threading.Thread(
                    target=self._photo_cleanup_worker,
                    name="mg-photo-cleanup",
                    daemon=True,
                )
                self._photo_cleanup_thread.start()

    def _photo_cleanup_worker(self) -> None:
        from app.services.lot_photos import delete_lot_photos, sweep_orphan_photos

        while True:
            lot_ids = self._photo_cleanup.get()
            try:
                for lot_id in lot_ids:
                    # Re-listed while waiting in the queue: keep its photos.
                    if lot_id not in self:
                        delete_lot_photos(lot_id)
                sweep_orphan_photos(self.ids())
            except Exception as exc:
                logger.warning("photo cleanup failed: %s", exc)
            finally:
                self._photo_cleanup.task_done()

    def persist(self, path: str | Path | None = None) -> int:
        """Every write is already committed; kept for the scrapers' checkpoints."""
        return self._count

    # ---- sync between nodes ------------------------------------------------

    def export_delta(self, after: int, limit: int) -> dict:
        """Changes after `after`, oldest first. `to` is the cursor to continue from."""
        head = self._seq
        rows = self._fetch(
            "SELECT seq, data FROM lots WHERE seq > ? AND seq <= ? ORDER BY seq LIMIT ?",
            (after, head, limit),
        )
        to = rows[-1][0] if len(rows) >= limit else head
        deleted = self._fetch(
            "SELECT id FROM lot_tombstones WHERE seq > ? AND seq <= ?", (after, to)
        )
        return {
            "from": after,
            "to": to,
            "done": to >= head,
            "lots": [json.loads(zlib.decompress(row[1])) for row in rows],
            "deleted": [row[0] for row in deleted],
        }

    def _apply_items(self, items: list[dict]) -> int:
        applied = 0
        for item in items:
            try:
                lot = AuctionLot.model_validate(item)
            except Exception:
                continue
            self._write(lot)
            applied += 1
        return applied

    def apply_delta(self, batch: dict) -> dict:
        """Apply one batch from the scraper node. Returns the new sync position.

        Starting from 0 is a full sync: when its last batch lands, whatever it
        did not touch is gone from the source and gets deleted here. The old
        catalog stays visible until then.
        """
        catalog = str(batch.get("catalog_id") or "")
        start = int(batch.get("from") or 0)
        to = int(batch.get("to") or 0)
        with self._tx():
            if start == 0:
                # A restarted full sync keeps the first mark: lots written by the
                # interrupted attempt must still count as "not confirmed yet".
                if not self.get_meta("sync_full_start"):
                    self.set_meta("sync_full_start", str(self._seq))
            elif catalog != self.get_meta("sync_catalog") or start != self.sync_cursor():
                return {"ok": False, **self.sync_state()}
            for lot_id in batch.get("deleted") or []:
                self._remove(str(lot_id))
            applied = self._apply_items(batch.get("lots") or [])
            full_start = self.get_meta("sync_full_start")
            if batch.get("done") and full_start:
                for lot_id in self.ids("seq <= ?", (int(full_start),)):
                    self._remove(lot_id)
                self.set_meta("sync_full_start", "")
            self.set_meta("sync_catalog", catalog)
            self.set_meta("sync_cursor", str(to))
        self.revision += 1
        return {"ok": True, "applied": applied, "total": self._count, **self.sync_state()}

    def replace_all(self, items: list[dict]) -> int:
        """Full catalog from a scraper node that has not been upgraded yet."""
        with self._tx():
            start = self._seq
            count = self._apply_items(items)
            for lot_id in self.ids("seq <= ?", (start,)):
                self._remove(lot_id)
            # Next delta sync has to start over.
            self.set_meta("sync_catalog", "")
            self.set_meta("sync_cursor", "0")
        self.revision += 1
        return count

    def sync_cursor(self) -> int:
        return int(self.get_meta("sync_cursor") or 0)

    def sync_state(self) -> dict:
        return {"catalog_id": self.get_meta("sync_catalog"), "cursor": self.sync_cursor()}

    def __len__(self) -> int:
        # Kept in a counter: /health must never wait on the catalog.
        return self._count


lot_store = LotStore()

# Simple in-memory leads inbox (replace with DB later)
leads_inbox: list[dict] = []


def slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (value or "x").lower()).strip("-")
    return (s or "x")[:40]
