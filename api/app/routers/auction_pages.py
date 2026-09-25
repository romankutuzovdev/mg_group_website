"""Serve /auctions/{slug}/ with the FULL Next.js site shell (Header/Footer).

1) If SSG file exists under out/auctions/{slug}/ -> FileResponse
2) Else inject slug into out/auctions/__live__/index.html (client fetch + same UI)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse

from app.config import get_settings
from app.data.store import lot_store

router = APIRouter(tags=["auction-pages"])


def _web_root() -> Path | None:
    settings = get_settings()
    raw = (settings.web_root or "").strip()
    if not raw:
        return None
    root = Path(raw).expanduser()
    return root if root.is_dir() else None


def _not_found_html(slug: str) -> str:
    s = json.dumps(slug, ensure_ascii=False)
    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Лот не найден | MG.GROUP</title></head>
<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>Лот не найден</h1>
<p>Страница {s} недоступна.</p>
<p><a href="/avto/">К каталогу авто</a></p>
</body></html>"""


@router.get("/auctions/{slug}")
@router.get("/auctions/{slug}/")
def auction_lot_page(slug: str, request: Request):
    clean = (slug or "").strip().strip("/")
    if not clean or clean in {"__live__", "_next"}:
        return HTMLResponse(_not_found_html(clean), status_code=404)

    root = _web_root()
    if root:
        static_page = root / "auctions" / clean / "index.html"
        if static_page.is_file():
            return FileResponse(static_page, media_type="text/html; charset=utf-8")

        live = root / "auctions" / "__live__" / "index.html"
        if live.is_file():
            html = live.read_text(encoding="utf-8")
            inject = (
                "<script>window.__MG_LOT_SLUG__="
                + json.dumps(clean, ensure_ascii=False)
                + ";</script>"
            )
            if re.search(r"</head>", html, flags=re.I):
                html = re.sub(r"</head>", inject + "</head>", html, count=1, flags=re.I)
            else:
                html = inject + html
            return HTMLResponse(html, status_code=200)

    # Fallback: lot exists in API store?
    lot = lot_store.get_by_slug(clean) or lot_store.get_by_id(clean)
    if lot is None:
        return HTMLResponse(_not_found_html(clean), status_code=404)

    # Minimal redirect hint if site not built yet
    return HTMLResponse(
        f"""<!DOCTYPE html><html lang="ru"><head>
<meta charset="utf-8"/><meta http-equiv="refresh" content="0;url=/avto/"/>
<title>Rebuild website</title></head>
<body><p>Соберите сайт: deploy-website.ps1 (нужен /auctions/__live__/)</p>
<p><a href="/api/v1/lots/{clean}">JSON лота</a></p></body></html>""",
        status_code=200,
    )
