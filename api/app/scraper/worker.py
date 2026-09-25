"""Multi-agent auction scrapers — each source runs in its own Chrome tab forever.

Sources: copart (USA), iaai, copart_uk, manheim, salvage_market, encar (Korea).

On Windows: start ONE Google Chrome with remote debugging (start-chrome-cdp.bat),
set SCRAPER_CDP_URL=http://127.0.0.1:9223 — all agents attach and open separate tabs
in that same window.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Literal

from playwright.async_api import Browser, Page, async_playwright

from app.config import get_settings
from app.data.store import lot_store
from app.models.lots import AuctionLot
from app.scraper.browser import (
    close_agent_tab,
    close_browser,
    get_shared_context,
    launch_chromium,
    open_agent_tab,
)
from app.scraper.copart_usa import scrape_copart_usa
from app.scraper.copart_uk import scrape_copart_uk
from app.scraper.iaai import scrape_iaai_usa
from app.scraper.manheim import scrape_manheim_usa
from app.scraper.salvage_market import scrape_salvage_market
from app.scraper.encar import scrape_encar
from app.scraper.mapper import (
    map_copart_row,
    map_copart_uk_row,
    map_iaai_row,
    map_manheim_row,
    map_salvage_market_row,
    map_encar_row,
)
from app.scraper.photo_enricher import PhotoEnrichmentAgent

logger = logging.getLogger("mg.scraper")

SourceName = Literal["copart", "iaai", "copart_uk", "manheim", "salvage_market", "encar", "all"]
ALL_SOURCES: tuple[str, ...] = ("copart", "iaai", "copart_uk", "manheim", "salvage_market", "encar")

# Warm URL opened when the agent's permanent tab is created.
AGENT_WARM_URLS: dict[str, str] = {
    "copart": (
        "https://www.copart.com/lotSearchResults/?free=true&query=*&displayStr=*"
        "&searchCriteria=%7B%22query%22%3A%5B%22*%22%5D%2C%22filter%22%3A%7B%22MISC%22%3A%5B"
        "%22%23VehicleTypeCode%3AVEHTYPE_V%22%2C%22%23LotFeatureCode%3AFeatureCode_PriVarT_1%22%5D%7D"
        "%2C%22sort%22%3A%5B%22auction_date_utc%20desc%22%5D%2C%22watchListOnly%22%3Afalse%7D"
    ),
    "iaai": "https://www.iaai.com/Search?status=Current&status=Future",
    "copart_uk": "https://www.copart.co.uk/lotSearchResults/?free=true&query=*",
    "manheim": "https://search.manheim.com/results?deeplink=/?sort=newlyListed",
    "salvage_market": (
        "https://www.salvagemarket.co.uk/Search"
        "?orderBy=10&pageNumber=0&pageSize=20&quickSearch=4"
    ),
    "encar": "https://www.encar.com/dc/dc_carsearchlist.do?carType=kor",
}

MapperFn = Callable[[dict[str, Any]], AuctionLot | None]
ScrapeFn = Callable[..., Awaitable[list[dict[str, Any]]]]


@dataclass
class AgentStatus:
    name: str
    running: bool = False
    cycles: int = 0
    total_new: int = 0
    total_upserted: int = 0
    last_started_at: str | None = None
    last_finished_at: str | None = None
    last_error: str | None = None
    last_blocked: str | None = None
    last_raw: int = 0
    last_mapped: int = 0
    last_new: int = 0
    tab_open: bool = False


@dataclass
class OrchestratorStatus:
    running: bool = False
    enabled: bool = False
    browser_mode: str = "launch"  # launch | cdp
    shared_chrome: bool = True
    agents: dict[str, AgentStatus] = field(default_factory=dict)
    started_at: str | None = None


def _is_browser_dead_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    needles = (
        "connection closed",
        "target closed",
        "browser has been closed",
        "browser closed",
        "protocol error",
        "session closed",
        "websocket",
        "driven closed",
    )
    return any(n in msg for n in needles)


class SourceAgent:
    """One continuous scraper loop — owns a permanent tab in the shared Chrome."""

    def __init__(
        self,
        name: str,
        scrape: ScrapeFn,
        mapper: MapperFn,
        *,
        interval_seconds: int = 600,
    ) -> None:
        self.name = name
        self.scrape = scrape
        self.mapper = mapper
        self.interval_seconds = interval_seconds
        self.status = AgentStatus(name=name)
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._page: Page | None = None
        self._browser_dead = asyncio.Event()

    async def attach_tab(self, browser: Browser) -> Page:
        """Open (or reuse) this agent's tab in the shared Chrome window."""
        if self._page is not None and not self._page.is_closed():
            self.status.tab_open = True
            return self._page
        ctx = await get_shared_context(browser)
        self._page = await open_agent_tab(
            ctx,
            label=self.name,
            url=AGENT_WARM_URLS.get(self.name),
        )
        self.status.tab_open = True
        return self._page

    async def detach_tab(self) -> None:
        await close_agent_tab(self._page)
        self._page = None
        self.status.tab_open = False

    async def start(self, browser: Browser) -> None:
        if self._task and not self._task.done():
            return
        await self.attach_tab(browser)
        self._stop = asyncio.Event()
        self.status.running = True
        self._task = asyncio.create_task(self._loop(browser), name=f"agent-{self.name}")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            try:
                await asyncio.wait_for(asyncio.shield(self._task), timeout=60)
            except Exception:
                self._task.cancel()
        await self.detach_tab()
        self.status.running = False

    async def run_once(self, browser: Browser, *, page: Page | None = None) -> dict[str, Any]:
        settings = get_settings()
        started = datetime.now(timezone.utc).isoformat()
        self.status.last_started_at = started
        self.status.last_error = None
        self.status.last_blocked = None
        stats: dict[str, Any] = {
            "source": self.name,
            "started_at": started,
            "raw": 0,
            "mapped": 0,
            "upserted": 0,
            "new": 0,
            "persisted": 0,
        }

        tab = page
        own_temp_tab = False
        try:
            if tab is None:
                tab = self._page
            if tab is None or tab.is_closed():
                tab = await self.attach_tab(browser)
                # for one-shot without continuous mode, caller may close later
                if page is None and (self._task is None or self._task.done()):
                    own_temp_tab = True

            kwargs: dict[str, Any] = {
                "headless": settings.scraper_headless,
                "timeout_ms": settings.scraper_timeout_ms,
                "page": tab,
            }
            if self.name == "copart":
                kwargs["max_pages"] = settings.scraper_max_pages_copart
                kwargs["page_size"] = settings.scraper_page_size
            elif self.name == "iaai":
                kwargs["max_pages"] = settings.scraper_max_pages_iaai
            elif self.name == "copart_uk":
                kwargs["max_pages"] = settings.scraper_max_pages_copart_uk
                kwargs["page_size"] = settings.scraper_page_size
            elif self.name == "manheim":
                kwargs["max_pages"] = settings.scraper_max_pages_manheim
                kwargs["page_size"] = min(50, settings.scraper_page_size)
                kwargs["bearer_token"] = settings.scraper_manheim_bearer_token or None
            elif self.name == "salvage_market":
                kwargs["max_pages"] = settings.scraper_max_pages_salvage_market
            elif self.name == "encar":
                kwargs["max_pages"] = settings.scraper_max_pages_encar
                kwargs["page_size"] = min(50, settings.scraper_page_size)

            raw = await self.scrape(**kwargs)
            if raw and isinstance(raw[0], dict) and raw[0].get("_blocked"):
                reason = str(raw[0].get("reason") or "blocked")
                self.status.last_blocked = reason
                stats["blocked"] = reason
                logger.warning("agent %s blocked: %s", self.name, reason)
                raw = []

            stats["raw"] = len(raw)
            mapped: list[AuctionLot] = []
            for row in raw:
                if not isinstance(row, dict) or row.get("_blocked"):
                    continue
                lot = self.mapper(row)
                if lot:
                    mapped.append(lot)

            stats["mapped"] = len(mapped)
            upserted, new_count = lot_store.upsert_many(mapped)
            stats["upserted"] = upserted
            stats["new"] = new_count
            pruned = lot_store.prune_ended()
            stats["pruned"] = pruned
            self.status.last_raw = len(raw)
            self.status.last_mapped = len(mapped)
            self.status.last_new = new_count
            self.status.total_new += new_count
            self.status.total_upserted += upserted
            self.status.cycles += 1

            if settings.scraper_persist and (mapped or pruned):
                stats["persisted"] = lot_store.persist()

            logger.info(
                "agent %s cycle: raw=%s mapped=%s new=%s pruned=%s store=%s tab=%s",
                self.name,
                stats["raw"],
                stats["mapped"],
                new_count,
                pruned,
                len(lot_store),
                self.name,
            )
        except Exception as exc:
            self.status.last_error = str(exc)
            stats["error"] = str(exc)
            logger.exception("agent %s failed: %s", self.name, exc)
            if _is_browser_dead_error(exc):
                self._page = None
                self.status.tab_open = False
                self._browser_dead.set()
                logger.warning("agent %s: Chrome/CDP dead — requesting reconnect", self.name)
        finally:
            if own_temp_tab:
                await self.detach_tab()

        finished = datetime.now(timezone.utc).isoformat()
        self.status.last_finished_at = finished
        stats["finished_at"] = finished
        return stats

    async def _loop(self, browser: Browser) -> None:
        while not self._stop.is_set():
            if self._browser_dead.is_set():
                break
            # Recreate tab if Chrome closed it
            if self._page is None or self._page.is_closed():
                try:
                    await self.attach_tab(browser)
                except Exception as exc:
                    self.status.last_error = f"tab_reopen: {exc}"
                    logger.exception("agent %s tab reopen failed", self.name)
                    if _is_browser_dead_error(exc):
                        self._browser_dead.set()
                        break
                    await asyncio.sleep(10)
                    continue
            await self.run_once(browser)
            if self._browser_dead.is_set():
                break
            try:
                await asyncio.wait_for(
                    self._stop.wait(),
                    timeout=max(30, self.interval_seconds),
                )
                break
            except asyncio.TimeoutError:
                continue
        self.status.running = False


class MultiAgentOrchestrator:
    """Owns one Google Chrome (or CDP attach) and N agent tabs in that window."""

    def __init__(self) -> None:
        self.status = OrchestratorStatus()
        self._agents: dict[str, SourceAgent] = {}
        self._photo_agent: PhotoEnrichmentAgent | None = None
        self._lock = asyncio.Lock()
        self._browser: Browser | None = None
        self._pw = None
        self._stop = asyncio.Event()
        self._supervisor: asyncio.Task | None = None

    def _enabled_sources(self) -> list[str]:
        settings = get_settings()
        wanted = {s.strip().lower() for s in settings.scraper_sources.split(",") if s.strip()}
        return [s for s in ALL_SOURCES if s in wanted]

    def _build_agents(self) -> dict[str, SourceAgent]:
        settings = get_settings()
        interval = max(60, settings.scraper_interval_seconds)
        specs: dict[str, tuple[ScrapeFn, MapperFn]] = {
            "copart": (scrape_copart_usa, map_copart_row),
            "iaai": (scrape_iaai_usa, map_iaai_row),
            "copart_uk": (scrape_copart_uk, map_copart_uk_row),
            "manheim": (scrape_manheim_usa, map_manheim_row),
            "salvage_market": (scrape_salvage_market, map_salvage_market_row),
            "encar": (scrape_encar, map_encar_row),
        }
        agents: dict[str, SourceAgent] = {}
        for name in self._enabled_sources():
            scrape, mapper = specs[name]
            agents[name] = SourceAgent(name, scrape, mapper, interval_seconds=interval)
        return agents

    def _all_specs(self) -> dict[str, tuple[ScrapeFn, MapperFn]]:
        return {
            "copart": (scrape_copart_usa, map_copart_row),
            "iaai": (scrape_iaai_usa, map_iaai_row),
            "copart_uk": (scrape_copart_uk, map_copart_uk_row),
            "manheim": (scrape_manheim_usa, map_manheim_row),
            "salvage_market": (scrape_salvage_market, map_salvage_market_row),
            "encar": (scrape_encar, map_encar_row),
        }

    def snapshot(self) -> dict[str, Any]:
        settings = get_settings()
        agents = {
            name: {
                "name": a.status.name,
                "running": a.status.running,
                "tab_open": a.status.tab_open,
                "cycles": a.status.cycles,
                "total_new": a.status.total_new,
                "total_upserted": a.status.total_upserted,
                "last_started_at": a.status.last_started_at,
                "last_finished_at": a.status.last_finished_at,
                "last_error": a.status.last_error,
                "last_blocked": a.status.last_blocked,
                "last_raw": a.status.last_raw,
                "last_mapped": a.status.last_mapped,
                "last_new": a.status.last_new,
            }
            for name, a in self._agents.items()
        }
        photos = self._photo_agent.snapshot() if self._photo_agent else None
        return {
            "running": self.status.running,
            "enabled": self.status.enabled,
            "browser_mode": self.status.browser_mode,
            "shared_chrome": True,
            "started_at": self.status.started_at,
            "lots_in_store": len(lot_store),
            "interval_seconds": settings.scraper_interval_seconds,
            "sources": settings.scraper_sources,
            "cdp_url": settings.scraper_cdp_url or None,
            "agents": agents,
            "photos": photos,
            "photos_enabled": settings.scraper_photos_enabled,
            "mode": "multi_agent_one_chrome_tabs",
            "cycles": sum(a.status.cycles for a in self._agents.values()),
            "total_new": sum(a.status.total_new for a in self._agents.values()),
            "total_seen": sum(a.status.total_upserted for a in self._agents.values()),
            "last_error": next(
                (a.status.last_error for a in self._agents.values() if a.status.last_error),
                None,
            ),
            "last_cycle": {n: agents[n] for n in agents},
        }

    async def start(self) -> dict[str, Any]:
        async with self._lock:
            if self._supervisor and not self._supervisor.done():
                return self.snapshot()
            self._stop = asyncio.Event()
            self.status.enabled = True
            self.status.running = True
            self.status.started_at = datetime.now(timezone.utc).isoformat()
            self._supervisor = asyncio.create_task(self._supervise(), name="mg-agents-supervisor")
            logger.info(
                "multi-agent scraper started (one Chrome, tabs): %s",
                ", ".join(self._enabled_sources()),
            )
            return self.snapshot()

    async def stop(self) -> dict[str, Any]:
        async with self._lock:
            self.status.enabled = False
            self._stop.set()
            for agent in self._agents.values():
                await agent.stop()
            if self._photo_agent:
                await self._photo_agent.stop()
            task = self._supervisor
        if task:
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=90)
            except Exception:
                task.cancel()
        await self._close_browser()
        self.status.running = False
        logger.info("multi-agent scraper stopped")
        return self.snapshot()

    async def run_once(self, sources: SourceName = "all") -> dict[str, Any]:
        settings = get_settings()
        names = list(ALL_SOURCES) if sources == "all" else [sources]
        if sources != "all" and sources not in ALL_SOURCES:
            names = []
        elif sources == "all":
            names = self._enabled_sources() or list(ALL_SOURCES)

        async with async_playwright() as pw:
            browser = await launch_chromium(
                pw,
                headless=settings.scraper_headless,
                cdp_url=settings.scraper_cdp_url or None,
                cdp_autostart=settings.scraper_cdp_autostart,
                cdp_fallback_launch=settings.scraper_cdp_fallback_launch,
                cdp_headless=settings.scraper_cdp_headless,
            )
            try:
                ctx = await get_shared_context(browser)
                results: dict[str, Any] = {}
                specs = self._all_specs()
                for name in names:
                    if name not in specs:
                        continue
                    scrape, mapper = specs[name]
                    agent = SourceAgent(name, scrape, mapper)
                    tab = await open_agent_tab(ctx, label=name, url=AGENT_WARM_URLS.get(name))
                    try:
                        results[name] = await agent.run_once(browser, page=tab)
                    finally:
                        # Keep CDP tabs; only close if we launched Chromium ourselves
                        await close_agent_tab(tab, force=not getattr(browser, "_mg_via_cdp", False))
                return {"mode": "run_once", "shared_chrome": True, "results": results}
            finally:
                await close_browser(browser)

    async def run_photos_once(self, *, limit: int = 25) -> dict[str, Any]:
        """One-shot photo enrichment batch (separate Chrome attach)."""
        settings = get_settings()
        async with async_playwright() as pw:
            browser = await launch_chromium(
                pw,
                headless=settings.scraper_headless,
                cdp_url=settings.scraper_cdp_url or None,
                cdp_autostart=settings.scraper_cdp_autostart,
                cdp_fallback_launch=settings.scraper_cdp_fallback_launch,
                cdp_headless=settings.scraper_cdp_headless,
            )
            try:
                agent = PhotoEnrichmentAgent()
                await agent.attach_tab(browser)
                try:
                    result = await agent.run_batch(browser, limit=limit)
                finally:
                    await agent.detach_tab()
                return {"mode": "photos_run_once", "result": result}
            finally:
                await close_browser(browser)

    async def _supervise(self) -> None:
        """Keep Chrome + agents alive. On CDP death — restart Chrome, never kill API."""
        settings = get_settings()
        backoff = 5.0
        while not self._stop.is_set():
            try:
                self._pw = await async_playwright().start()
                self._browser = await launch_chromium(
                    self._pw,
                    headless=settings.scraper_headless,
                    cdp_url=settings.scraper_cdp_url or None,
                    cdp_autostart=settings.scraper_cdp_autostart,
                    cdp_fallback_launch=settings.scraper_cdp_fallback_launch,
                    cdp_headless=settings.scraper_cdp_headless,
                )
                via_cdp = bool(getattr(self._browser, "_mg_via_cdp", False))
                self.status.browser_mode = "cdp" if via_cdp else "launch"
                self.status.shared_chrome = True
                self._agents = self._build_agents()
                self.status.agents = {n: a.status for n, a in self._agents.items()}

                pruned = lot_store.prune_ended()
                if pruned and settings.scraper_persist:
                    lot_store.persist()
                    logger.info("startup prune: removed %s ended lots", pruned)

                for i, agent in enumerate(self._agents.values()):
                    agent._browser_dead = asyncio.Event()
                    await agent.attach_tab(self._browser)
                    # Stagger first navigations — parallel goto kills headless Chrome
                    await asyncio.sleep(2.0 + i * 1.5)
                for i, agent in enumerate(self._agents.values()):
                    await agent.start(self._browser)
                    await asyncio.sleep(3.0)

                if settings.scraper_photos_enabled:
                    self._photo_agent = PhotoEnrichmentAgent()
                    await asyncio.sleep(5.0)
                    await self._photo_agent.attach_tab(self._browser)
                    await self._photo_agent.start(self._browser)
                    logger.info("photo enricher started (lot cards → full galleries)")

                logger.info(
                    "shared Chrome ready mode=%s tabs=%s photos=%s",
                    self.status.browser_mode,
                    list(self._agents.keys()),
                    bool(self._photo_agent),
                )
                backoff = 5.0

                # Stay until stop, CDP death, or an agent reports browser dead
                while not self._stop.is_set():
                    await asyncio.sleep(8)
                    if any(a._browser_dead.is_set() for a in self._agents.values()):
                        logger.warning("agent reported dead Chrome — reconnecting")
                        break
                    browser = self._browser
                    if browser is None:
                        break
                    try:
                        _ = browser.contexts
                        if via_cdp and settings.scraper_cdp_url:
                            from app.scraper.chrome_cdp import cdp_responsive

                            if not cdp_responsive(settings.scraper_cdp_url, timeout=1.0):
                                logger.warning("CDP port died — reconnecting Chrome")
                                break
                    except Exception as exc:
                        logger.warning("browser liveness failed: %s — reconnecting", exc)
                        break

            except Exception as exc:
                logger.exception("supervisor session failed (will retry): %s", exc)
            finally:
                if self._photo_agent:
                    try:
                        await self._photo_agent.stop()
                    except Exception:
                        pass
                    self._photo_agent = None
                for agent in list(self._agents.values()):
                    try:
                        await agent.stop()
                    except Exception:
                        pass
                self._agents = {}
                await self._close_browser()

            if self._stop.is_set():
                break
            logger.info("supervisor retry in %.0fs", backoff)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=backoff)
                break
            except asyncio.TimeoutError:
                pass
            backoff = min(120.0, backoff * 1.5)

        self.status.running = False
        logger.info("multi-agent scraper supervisor stopped")

    async def _close_browser(self) -> None:
        if self._browser is not None:
            await close_browser(self._browser)
            self._browser = None
        if self._pw is not None:
            try:
                await self._pw.stop()
            except Exception:
                pass
            self._pw = None


# Backwards-compatible name used by routers / main
scraper_worker = MultiAgentOrchestrator()


def start_scraper_in_background() -> None:
    settings = get_settings()
    if not settings.scraper_autostart:
        logger.info("scraper autostart disabled (set SCRAPER_AUTOSTART=true)")
        return

    async def _boot() -> None:
        await asyncio.sleep(3)
        try:
            await scraper_worker.start()
        except Exception as exc:
            logger.exception("scraper boot failed (API stays up): %s", exc)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_boot())
    except RuntimeError:

        def _thread() -> None:
            try:
                asyncio.run(scraper_worker.start())
            except Exception as exc:
                logger.exception("scraper thread failed (API stays up): %s", exc)

        threading.Thread(target=_thread, name="mg-scraper-boot", daemon=True).start()
