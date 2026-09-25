from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.config import get_settings
from app.data.store import lot_store
from app.routers import (
    auction_pages,
    auth,
    cabinet,
    content,
    health,
    lot_image,
    lots,
    pricing,
    purchased_cars,
    scraper,
)
from app.scraper.worker import scraper_worker, start_scraper_in_background
from app.services.cabinet_store import cabinet_store
from app.services.purchased_cars_store import purchased_cars_store


@asynccontextmanager
async def lifespan(_app: FastAPI):
    n = lot_store.reload()
    print(f"[mg-api] loaded {n} lots from disk")
    cabinet_store.init()
    purchased_cars_store.init()
    print("[mg-api] cabinet + purchased cars db ready")
    start_scraper_in_background()
    yield
    try:
        await scraper_worker.stop()
    except Exception:
        pass


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        description=(
            "MG.GROUP API. Лоты Copart/IAAI, тарифы, контент, "
            "личный кабинет (Telegram Login), Playwright-парсер."
        ),
        lifespan=lifespan,
    )

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins != ["*"] else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    prefix = settings.api_prefix
    app.include_router(health.router)
    app.include_router(lots.router, prefix=prefix)
    app.include_router(pricing.router, prefix=prefix)
    app.include_router(content.router, prefix=prefix)
    app.include_router(scraper.router, prefix=prefix)
    app.include_router(auth.router, prefix=prefix)
    app.include_router(cabinet.router, prefix=prefix)
    app.include_router(purchased_cars.router, prefix=prefix)
    # Dynamic lot HTML + image proxy (before StaticFiles)
    app.include_router(auction_pages.router)
    app.include_router(lot_image.router)

    @app.api_route(
        f"{prefix}/{{full_path:path}}/",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
        include_in_schema=False,
    )
    async def _api_strip_trailing_slash(full_path: str, request: Request):
        """StaticFiles would 404 /api/.../ — redirect to the real route without slash."""
        target = f"{prefix}/{full_path}".rstrip("/")
        if request.url.query:
            target = f"{target}?{request.url.query}"
        return RedirectResponse(url=target, status_code=307)

    @app.api_route(
        "/api/{full_path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
        include_in_schema=False,
    )
    async def _api_unknown(full_path: str):
        return JSONResponse({"detail": f"Not Found: /api/{full_path}"}, status_code=404)

    # Website (Next static export) — same origin as API on Windows (e.g. http://IP/)
    web_root = Path(settings.web_root).expanduser() if settings.web_root.strip() else None
    if web_root and web_root.is_dir():
        print(f"[mg-api] serving website from {web_root}")
        app.mount("/", StaticFiles(directory=str(web_root), html=True), name="site")
    else:
        print(f"[mg-api] website not mounted (web_root={settings.web_root!r})")

    return app


app = create_app()
