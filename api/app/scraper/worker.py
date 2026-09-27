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
    mark_agent_tab,
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
    waiting_for_vpn: bool = False


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

    async def attach_tab(self, browser: Browser, *, warm: bool = False) -> Page:
        """Open (or reuse) this agent's tab in the shared Chrome window.

        ``warm=False`` (default): open blank tab quickly so the agent loop can start.
        Scrapers navigate themselves. Warming all auction URLs at attach blocks startup
        for minutes behind Copart/IAAI bot walls.
        """
        if self._page is not None and not self._page.is_closed():
            self.status.tab_open = True
            return self._page
        ctx = await get_shared_context(browser)
        self._page = await open_agent_tab(
            ctx,
            label=self.name,
            url=AGENT_WARM_URLS.get(self.name) if warm else None,
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
        settings = get_settings()
        while not self._stop.is_set():
            if self._browser_dead.is_set():
                break
            # Recreate tab if Chrome closed it
            if self._page is None or self._page.is_closed():
                try:
                    await self.attach_tab(browser, warm=True)
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
            # After bot-wall: force-close poisoned tab, reopen on real URL next cycle
            blocked = self.status.last_blocked
            if blocked:
                logger.info(
                    "agent %s blocked (%s) — closing tab, retry in %ss (enable VPN then wait)",
                    self.name,
                    blocked,
                    settings.scraper_blocked_retry_seconds,
                )
                try:
                    await close_agent_tab(self._page, force=True)
                except Exception:
                    pass
                self._page = None
                self.status.tab_open = False
            sleep_for = (
                max(30, settings.scraper_blocked_retry_seconds)
                if blocked
                else max(30, self.interval_seconds)
            )
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=sleep_for)
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
        self._calc_page: Page | None = None
        self._lock = asyncio.Lock()
        self._calc_lookup_lock = asyncio.Lock()
        self._browser: Browser | None = None
        self._pw = None
        self._stop = asyncio.Event()
        self._supervisor: asyncio.Task | None = None

    async def evaluate_on_agent_tab(
        self,
        source: str,
        expression: str,
        arg: Any = None,
        *,
        timeout_sec: float = 6.0,
    ) -> Any | None:
        """Run JS on an existing scraper tab (no new Chrome tabs).

        Used by calculator lot-from-url to read Copart Solr with live cookies.
        If another calc lookup is in progress, returns None immediately.
        """
        try:
            await asyncio.wait_for(self._calc_lookup_lock.acquire(), timeout=0.05)
        except asyncio.TimeoutError:
            return None
        try:
            agent = self._agents.get(source)
            page = agent._page if agent else None
            if page is None or page.is_closed():
                return None
            return await asyncio.wait_for(
                page.evaluate(expression, arg),
                timeout=timeout_sec,
            )
        except Exception as exc:
            logger.warning("evaluate_on_agent_tab %s: %s", source, exc)
            return None
        finally:
            self._calc_lookup_lock.release()

    async def _warm_agent_tabs(self, names: set[str] | None = None) -> None:
        """Navigate tabs one-by-one (never in parallel — parallel goto kills CDP/Chrome)."""
        for agent in self._agents.values():
            if names is not None and agent.name not in names:
                continue
            if self._stop.is_set():
                return
            url = AGENT_WARM_URLS.get(agent.name)
            page = agent._page
            if not url or page is None or page.is_closed():
                # Tab missing after Chrome restart — recreate blank, then navigate
                if self._browser is None:
                    continue
                try:
                    await agent.attach_tab(self._browser, warm=False)
                    page = agent._page
                except Exception as exc:
                    logger.warning("re-attach tab %s failed: %s", agent.name, exc)
                    continue
            if not url or page is None or page.is_closed():
                continue
            try:
                logger.info("warming tab %s → %s", agent.name, url[:90])
                await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                await mark_agent_tab(page, agent.name)
                agent.status.tab_open = True
            except Exception as exc:
                logger.warning("warm tab %s failed (Chrome stays open): %s", agent.name, exc)
                try:
                    await mark_agent_tab(page, agent.name)
                except Exception:
                    pass
            await asyncio.sleep(1.5)

    async def _ensure_calc_tab(self) -> None:
        """Keep site calculator open in Chrome permanently."""
        settings = get_settings()
        if not settings.scraper_calc_tab_enabled:
            return
        url = (settings.scraper_calc_tab_url or "").strip()
        if not url or self._browser is None:
            return
        try:
            page = self._calc_page
            if page is not None and not page.is_closed():
                try:
                    await mark_agent_tab(page, "calculator")
                except Exception:
                    pass
                return
            ctx = await get_shared_context(self._browser)
            self._calc_page = await open_agent_tab(ctx, label="calculator", url=url)
            logger.info("calculator tab open: %s", url)
        except Exception as exc:
            logger.warning("calculator tab failed: %s", exc)
            self._calc_page = None

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
                "waiting_for_vpn": a.status.waiting_for_vpn,
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
            "calc_tab_url": settings.scraper_calc_tab_url if settings.scraper_calc_tab_enabled else None,
            "calc_tab_open": bool(self._calc_page and not self._calc_page.is_closed()),
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
        force_chrome = False
        while not self._stop.is_set():
            try:
                if force_chrome and settings.scraper_cdp_url:
                    from app.scraper.chrome_cdp import ensure_chrome_cdp

                    logger.warning("forcing Chrome CDP relaunch after disconnect/death")
                    ensure_chrome_cdp(
                        settings.scraper_cdp_url,
                        autostart=True,
                        headless=settings.scraper_cdp_headless,
                        # Never kill user's Chrome — only start if CDP is down
                        force_restart=False,
                        wait_seconds=45.0,
                    )
                    force_chrome = False

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
                    await agent.attach_tab(self._browser, warm=False)
                    await asyncio.sleep(0.35)

                vpn_names = {
                    s.strip().lower()
                    for s in (settings.scraper_vpn_sources or "").split(",")
                    if s.strip()
                }
                early = [a for n, a in self._agents.items() if n not in vpn_names]
                late = [a for n, a in self._agents.items() if n in vpn_names]

                # Calculator first, then ONLY Copart tabs (sequential). Do NOT warm all
                # sources at once — that crashes CDP and Chrome reloads empty.
                await self._ensure_calc_tab()
                if late:
                    await self._warm_agent_tabs({a.name for a in late})

                for agent in early:
                    agent.status.waiting_for_vpn = False
                    await agent.start(self._browser)
                    await asyncio.sleep(0.8)

                delay = max(0, int(settings.scraper_startup_delay_seconds or 0))
                if late and delay > 0:
                    for agent in late:
                        agent.status.waiting_for_vpn = True
                        agent.status.last_error = f"waiting_for_vpn_{delay}s"
                    logger.info(
                        "waiting %ss for VPN before scraping: %s "
                        "(Copart tabs should show the site — enable VPN / login)",
                        delay,
                        ", ".join(a.name for a in late),
                    )
                    try:
                        await asyncio.wait_for(self._stop.wait(), timeout=delay)
                        break
                    except asyncio.TimeoutError:
                        pass
                    await self._warm_agent_tabs({a.name for a in late})
                    await self._ensure_calc_tab()

                for agent in late:
                    if self._stop.is_set():
                        break
                    agent.status.waiting_for_vpn = False
                    agent.status.last_error = None
                    await agent.start(self._browser)
                    await asyncio.sleep(0.8)

                logger.info(
                    "agents started: %s — first scrape cycles running in Chrome tabs",
                    ", ".join(self._agents.keys()),
                )

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
                    await self._ensure_calc_tab()
                    if any(a._browser_dead.is_set() for a in self._agents.values()):
                        logger.warning("agent reported dead Chrome — reconnecting")
                        force_chrome = True
                        break
                    browser = self._browser
                    if browser is None:
                        force_chrome = True
                        break
                    try:
                        _ = browser.contexts
                        if via_cdp and settings.scraper_cdp_url:
                            from app.scraper.chrome_cdp import cdp_responsive

                            if not cdp_responsive(settings.scraper_cdp_url, timeout=1.0):
                                logger.warning("CDP port died — reconnecting Chrome")
                                force_chrome = True
                                break
                    except Exception as exc:
                        logger.warning("browser liveness failed: %s — reconnecting", exc)
                        force_chrome = True
                        break

            except Exception as exc:
                logger.exception("supervisor session failed (will retry): %s", exc)
                force_chrome = True
            finally:
                self._calc_page = None
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
