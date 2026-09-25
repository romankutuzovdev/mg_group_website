"""Serve /auctions/{slug}/ HTML on Windows (Next SSG skips these pages).

Cloudflare Pages uses functions/auctions/[[slug]].js; uvicorn StaticFiles alone
returns 404 because SEO_AUCTION_SSG_LIMIT=0 exports no HTML files.
"""

from __future__ import annotations

import html
import json
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.data.store import lot_store

router = APIRouter(tags=["auction-pages"])

REGION_LABELS = {
    "usa": "США",
    "uk": "Великобритания",
    "korea": "Корея",
    "china": "Китай",
}


def _esc(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def _money(amount: Any, currency: str | None) -> str:
    try:
        n = float(amount)
    except (TypeError, ValueError):
        return "—"
    if not (n == n):  # NaN
        return "—"
    cur = currency or "USD"
    try:
        return f"{n:,.0f} {cur}".replace(",", " ")
    except Exception:
        return f"{n} {cur}"


def _not_found(slug: str) -> str:
    s = _esc(slug)
    return f"""<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Лот не найден | MG.GROUP</title>
<meta name="robots" content="noindex"/>
<style>body{{margin:0;font-family:system-ui,sans-serif;background:#fafafa;color:#18181b}}
main{{max-width:40rem;margin:4rem auto;padding:0 1.25rem}}a{{color:#16a34a}}</style>
</head><body><main>
<h1>Лот не найден</h1>
<p>Страница «{s}» недоступна или торги уже завершены.</p>
<p><a href="/avto/">← К каталогу авто</a></p>
</main></body></html>"""


def _lot_html(lot: Any, request: Request) -> str:
    slug = getattr(lot, "slug", "") or ""
    path = f"/auctions/{slug}/"
    # Prefer current host (mg-group.by or IP) for canonical
    base = str(request.base_url).rstrip("/")
    url = f"{base}{path}"
    year = getattr(lot, "year", "")
    make = getattr(lot, "make", "")
    model = getattr(lot, "model", "")
    title = f"{year} {make} {model} | MG.GROUP"
    bid = getattr(lot, "currentBid", 0)
    currency = getattr(lot, "currency", "USD") or "USD"
    lot_number = getattr(lot, "lotNumber", "")
    damage = getattr(lot, "primaryDamage", "") or "Аукцион"
    description = f"Лот #{lot_number}. {damage}. Ставка от {_money(bid, currency)}."
    image = getattr(lot, "imageUrl", "") or ""
    if not str(image).startswith("http"):
        image = f"{base}/logo.png"
    region_key = getattr(lot, "region", "usa") or "usa"
    region = REGION_LABELS.get(region_key, str(region_key).upper())
    catalog_href = (
        "/mashinokomplekt/uk/#lots" if region_key == "uk" else f"/avto/{region_key}/#lots"
    )
    catalog_label = (
        "← К комплектам из Англии" if region_key == "uk" else f"← К каталогу авто из {region}"
    )

    rows = [
        ("Повреждение (основное)", getattr(lot, "primaryDamage", None)),
        ("Повреждение (доп.)", getattr(lot, "secondaryDamage", None)),
        ("Title", getattr(lot, "titleLabel", None)),
        (
            "Пробег",
            f"{getattr(lot, 'odometer', '')} {getattr(lot, 'odometerUnit', 'mi') or 'mi'}"
            if getattr(lot, "odometer", None) is not None
            else None,
        ),
        ("Двигатель", getattr(lot, "engine", None)),
        ("Кузов", getattr(lot, "bodyStyle", None)),
        ("КПП", getattr(lot, "transmission", None)),
        ("Топливо", getattr(lot, "fuel", None)),
        ("Привод", getattr(lot, "drive", None)),
        ("Цвет", getattr(lot, "exteriorColor", None)),
        ("Локация", getattr(lot, "location", None)),
        ("Площадка", getattr(lot, "source", None)),
        ("Дата аукциона", getattr(lot, "auctionDate", None)),
    ]
    rows_html = "".join(
        f'<div class="row"><span>{_esc(k)}</span><strong>{_esc(v)}</strong></div>'
        for k, v in rows
        if v is not None and str(v).strip() != ""
    )

    json_ld = {
        "@context": "https://schema.org",
        "@type": "Vehicle",
        "name": f"{year} {make} {model}",
        "brand": {"@type": "Brand", "name": make},
        "model": model,
        "vehicleModelDate": str(year),
        "image": image,
        "url": url,
        "offers": {
            "@type": "Offer",
            "url": url,
            "priceCurrency": currency,
            "price": bid,
            "availability": "https://schema.org/InStock",
        },
    }

    vin = getattr(lot, "vin", "") or ""
    tg_text = (
        f"Здравствуйте! Нужен Carfax по лоту #{lot_number}: "
        f"{year} {make} {model}, VIN {vin}."
    )
    tg = f"https://t.me/Yury_MG_Global?text={quote(tg_text)}"

    ld_json = json.dumps(json_ld, ensure_ascii=False).replace("<", "\\u003c")
    heading = f"{year} {make} {model}"
    source = getattr(lot, "source", "") or ""

    return f"""<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{_esc(title)}</title>
<meta name="description" content="{_esc(description)}"/>
<link rel="canonical" href="{_esc(url)}"/>
<meta property="og:title" content="{_esc(title)}"/>
<meta property="og:description" content="{_esc(description)}"/>
<meta property="og:image" content="{_esc(image)}"/>
<meta property="og:url" content="{_esc(url)}"/>
<script type="application/ld+json">{ld_json}</script>
<style>
:root{{--accent:#16a34a;--fg:#18181b;--muted:#71717a;--border:#e4e4e7;--bg:#fafafa}}
*{{box-sizing:border-box}}body{{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);line-height:1.5}}
a{{color:var(--accent);text-decoration:none}}main{{max-width:56rem;margin:0 auto;padding:1.5rem 1.25rem 3rem}}
.card{{background:#fff;border:1px solid var(--border);border-radius:1rem;overflow:hidden}}
.hero{{aspect-ratio:16/10;background:#e4e4e7;object-fit:cover;width:100%;display:block}}
.pad{{padding:1.25rem 1.5rem}}.row{{display:flex;justify-content:space-between;gap:1rem;padding:.55rem 0;border-bottom:1px solid var(--border);font-size:.9rem}}
.row span{{color:var(--muted)}}.price{{font-size:1.5rem;font-weight:700;color:var(--accent)}}
.btn{{display:inline-flex;margin-top:1rem;padding:.75rem 1.25rem;background:var(--accent);color:#fff;border-radius:.5rem;font-weight:600}}
.muted{{color:var(--muted);font-size:.875rem}}
</style>
</head><body>
<main>
<p class="muted"><a href="{_esc(catalog_href)}">{_esc(catalog_label)}</a></p>
<article class="card">
<img class="hero" src="{_esc(image)}" alt="{_esc(heading)}"/>
<div class="pad">
<h1 style="margin:0 0 .35rem;font-size:1.5rem">{_esc(heading)}</h1>
<p class="muted">Лот #{_esc(lot_number)} · {_esc(region)} · {_esc(source)}</p>
<p class="price">{_esc(_money(bid, currency))}</p>
{rows_html}
<a class="btn" href="{tg}" target="_blank" rel="noopener">Написать менеджеру</a>
</div>
</article>
</main>
</body></html>"""


@router.get("/auctions/{slug}")
@router.get("/auctions/{slug}/")
def auction_lot_page(slug: str, request: Request) -> HTMLResponse:
    clean = (slug or "").strip().strip("/")
    lot = lot_store.get_by_slug(clean) or lot_store.get_by_id(clean)
    if lot is None:
        # try without trailing junk
        lot = lot_store.get_by_slug(clean.lower())
    if lot is None:
        return HTMLResponse(_not_found(clean), status_code=404)
    return HTMLResponse(_lot_html(lot, request), status_code=200)
