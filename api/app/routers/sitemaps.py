"""Static build pages and bounded sitemap shards for the current public catalog."""

import logging
import sqlite3
import time
from collections.abc import Iterable, Iterator
from functools import lru_cache
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse

from app.config import get_settings
from app.data.store import lot_store
from app.services.lot_seo import SITE_ORIGIN, is_public_lot_slug, lot_path

router = APIRouter(include_in_schema=False)
inventory_router = APIRouter(include_in_schema=False)
logger = logging.getLogger(__name__)
SHARD_SIZE = 5_000
MAX_ROWID = 2**63 - 1
XML_HEADERS = {"Cache-Control": "public, max-age=180"}
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


def _static_sitemap() -> Path:
    root = get_settings().web_root.strip()
    if root:
        file = Path(root).expanduser() / "sitemap.xml"
        if file.is_file():
            return file
    raise HTTPException(503, "Карта страниц ещё не собрана", headers={"Retry-After": "180"})


def _xml(locations: Iterable[str], *, index: bool = False) -> Response:
    root, tag = ("sitemapindex", "sitemap") if index else ("urlset", "url")
    nodes = "\n".join(f"<{tag}><loc>{escape(url)}</loc></{tag}>" for url in locations)
    body = f'<?xml version="1.0" encoding="UTF-8"?>\n<{root} xmlns="{NS}">\n{nodes}\n</{root}>\n'
    return Response(body, media_type="application/xml", headers=XML_HEADERS)


def _has_photo(url: str) -> bool:
    url = url.strip().lower()
    return (
        url.startswith(("https://", "http://", "/api/lot-image", "/api/lot-photos/", "/auctions/lots/"))
        and "_placeholder" not in url and "unsplash.com" not in url
    )


def _auction_urls(after: int, through: int) -> Iterator[tuple[int, str]]:
    for rowid, lot in lot_store.sitemap_candidates(after, through):
        if not is_public_lot_slug(lot.slug):
            continue
        if not (_has_photo(lot.imageUrl) or any(_has_photo(url) for url in lot.imageUrls or [])):
            continue
        url = SITE_ORIGIN + lot_path(lot.slug)
        if len(url) < 2048:
            yield rowid, url


@lru_cache(maxsize=1)
def _sitemap_locations(catalog_id: str, revision: int, time_window: int) -> tuple[str, ...]:
    # Inventory writes and the passing of auction deadlines both invalidate the index.
    locations = [SITE_ORIGIN + "/sitemap-pages.xml"]
    after = 0
    while after < MAX_ROWID:
        first = next(_auction_urls(after, MAX_ROWID), None)
        if first is None:
            break
        page = (first[0] - 1) // SHARD_SIZE + 1
        locations.append(f"{SITE_ORIGIN}/sitemap-auctions-{page}.xml")
        # Skip the rest of this shard. A sale cannot shift other shards' boundaries.
        after = page * SHARD_SIZE
    return tuple(locations)


@inventory_router.api_route("/sitemap.xml", methods=["GET", "HEAD"])
def inventory_index():
    """Also works on a catalog-only node behind an alternative website host."""
    try:
        locations = _sitemap_locations(lot_store.catalog_id, lot_store.revision, int(time.monotonic() // 180))
        return _xml(locations, index=True)
    except sqlite3.Error as exc:
        logger.exception("Failed to read sitemap inventory")
        raise HTTPException(503, "Каталог временно недоступен", headers={"Retry-After": "180"}) from exc


@router.api_route("/sitemap.xml", methods=["GET", "HEAD"])
def sitemap_index():
    file = _static_sitemap()
    try:
        return inventory_index()
    except HTTPException:
        return FileResponse(file, media_type="application/xml", headers=XML_HEADERS)


@router.api_route("/sitemap-pages.xml", methods=["GET", "HEAD"])
def static_pages():
    return FileResponse(_static_sitemap(), media_type="application/xml", headers=XML_HEADERS)


@router.api_route("/sitemap-auctions-{page:int}.xml", methods=["GET", "HEAD"])
@inventory_router.api_route("/sitemap-auctions-{page:int}.xml", methods=["GET", "HEAD"])
def auction_sitemap(page: int):
    if not 1 <= page <= (MAX_ROWID - 1) // SHARD_SIZE + 1:
        raise HTTPException(404)
    try:
        urls = [url for _, url in _auction_urls((page - 1) * SHARD_SIZE, min(page * SHARD_SIZE, MAX_ROWID))]
    except sqlite3.Error as exc:
        raise HTTPException(503, "Каталог временно недоступен", headers={"Retry-After": "180"}) from exc
    if not urls:
        raise HTTPException(404)
    return _xml(urls)
