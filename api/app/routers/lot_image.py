"""Same-origin image proxy for auction CDNs that hotlink-protect (IAAI / Encar).

Copart cs.*/c-static.* are public and should be loaded directly from the browser
(see lib/auctions/lot-image-url.ts) — proxying them via Windows often 502s.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

from app.services.lot_photos import resolve_photo_file

router = APIRouter(tags=["lot-image"])

_ALLOWED = re.compile(
    r"("
    r"^(?:cs|c-static)\.copart\.(?:com|co\.uk)$|"
    r"(?:^|\.)iaai\.com$|"
    r"(?:^|\.)anvisimages\.com$|"
    r"(?:^|\.)encar\.com$|"
    r"(?:^|\.)bid\.cars$|"
    r"(?:^|\.)cloudfront\.net$|"
    r"(?:^|\.)amazonaws\.com$"
    r")",
    re.I,
)

_JUNK = re.compile(
    r"\.svg(?:$|\?)|/content/[a-z]{2}\.svg|www\.copart\.(?:com|co\.uk)/content/|\bflag\b|/logo|sprite|1x1|pixel|blank\.",
    re.I,
)


def _referer_for(host: str, url: str) -> str:
    h = host.lower()
    if "copart.co.uk" in h or "copart.co.uk" in url.lower():
        return "https://www.copart.co.uk/"
    if "copart" in h:
        return "https://www.copart.com/"
    if "iaai" in h or "anvis" in h:
        return "https://www.iaai.com/"
    if "encar" in h:
        return "https://www.encar.com/"
    if "bid.cars" in h:
        return "https://bid.cars/"
    return f"https://{host}/"


@router.get("/api/lot-image")
async def proxy_lot_image(u: str = Query(..., min_length=8)) -> Response:
    target = (u or "").strip()
    try:
        parsed = urlparse(target)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Bad URL") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Bad URL")
    if _JUNK.search(target):
        raise HTTPException(status_code=404, detail="Not a lot photo")
    host = parsed.hostname
    if not _ALLOWED.search(host):
        raise HTTPException(status_code=403, detail="Host not allowed")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Referer": _referer_for(host, target),
        "Origin": _referer_for(host, target).rstrip("/"),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12.0) as client:
            upstream = await client.get(target, headers=headers)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {exc}") from exc

    if upstream.status_code == 404:
        raise HTTPException(status_code=404, detail="Not found")
    if upstream.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Upstream {upstream.status_code}")

    ctype = upstream.headers.get("content-type") or "image/jpeg"
    if "image" not in ctype.lower() and "octet-stream" not in ctype.lower():
        ctype = "image/jpeg"

    return Response(
        content=upstream.content,
        status_code=200,
        media_type=ctype,
        headers={
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/api/lot-photos/{lot_id}/{filename}")
def serve_saved_lot_photo(lot_id: str, filename: str) -> FileResponse:
    path = resolve_photo_file(lot_id, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(
        path,
        headers={"Cache-Control": "public, max-age=86400"},
    )
