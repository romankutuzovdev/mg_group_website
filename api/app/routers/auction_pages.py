"""Render the current public lot in the Next.js shell from this site's build."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

from app.config import get_settings
from app.routers.lots import public_lot_page_data
from app.services.lot_seo import lot_path

router = APIRouter(tags=["auction-pages"])

# The export writes this prop exactly once in the Next bootstrap JSON.
_PAGE_PROP = '"auctionPage":null'
_MARKERS = re.compile(r'__MG_LOT_([a-zA-Z]+)__|"auctionPage":null')


def _web_root() -> Path | None:
    raw = (get_settings().web_root or "").strip()
    return Path(raw).expanduser() if raw else None


def _notice(title: str, status: int) -> HTMLResponse:
    return HTMLResponse(
        f'<!doctype html><html lang="ru"><head><meta charset="utf-8">'
        f'<meta name="robots" content="noindex"><title>{title} | MG.GROUP</title></head>'
        f'<body><main><h1>{title}</h1><a href="/avto/">К каталогу авто</a></main></body></html>',
        status_code=status, headers={"Cache-Control": "no-store"},
    )


def _render(template: str, page: dict) -> str:
    payload = {"lot": page["lot"].model_dump(exclude_none=True), "preview": page["preview"]}
    # Script elements are raw text to the HTML parser, including JSON scripts.
    serialized = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).replace("<", r"\u003c")
    return _MARKERS.sub(
        lambda match: '"auctionPage":' + serialized if match[0] == _PAGE_PROP
        else html.escape(page["preview"][match[1]]),
        template,
    )


# Also serves deployments where only the API is installed or the site export
# is still being updated. All fields are escaped by the same template renderer.
_FALLBACK = """<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__MG_LOT_title__</title><meta name="description" content="__MG_LOT_description__">
<link rel="canonical" href="__MG_LOT_canonical__"><meta name="robots" content="__MG_LOT_robots__">
</head><body><main><a href="/avto/">К каталогу авто</a><h1>__MG_LOT_name__</h1>
<p>Лот №__MG_LOT_number__</p><dl><dt>__MG_LOT_priceLabel__</dt><dd>__MG_LOT_price__</dd>
<dt>Статус лота</dt><dd>__MG_LOT_status__</dd></dl><a href="/contacts/">Оставить заявку</a>
</main></body></html>"""


@router.api_route("/auctions/{slug}", methods=["GET", "HEAD"])
@router.api_route("/auctions/{slug}/", methods=["GET", "HEAD"])
@router.api_route("/auctions/{slug}/index.html", methods=["GET", "HEAD"], include_in_schema=False)
def auction_lot_page(slug: str, request: Request):
    root = _web_root()
    if slug == "damage-map-sedan.png" and root and request.url.path.endswith(".png"):
        asset = root / "auctions" / slug
        if asset.is_file():
            return FileResponse(asset)

    try:
        page = public_lot_page_data(slug)
    except HTTPException as exc:
        if exc.status_code == 404:
            return _notice("Лот не найден", 404)
        raise
    canonical_path = lot_path(page["lot"].slug)
    if slug != page["lot"].slug or not request.url.path.endswith("/"):
        query = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(canonical_path + query, status_code=308)

    template = _FALLBACK
    if root:
        path = root / "auctions" / "__live__" / "index.html"
        if path.is_file():
            exported = path.read_text(encoding="utf-8")
            if _PAGE_PROP in exported and "__MG_LOT_name__" in exported:
                template = exported
    return HTMLResponse(_render(template, page), headers={"Cache-Control": "no-cache"})
