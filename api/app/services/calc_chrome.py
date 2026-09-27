"""Shared Chrome CDP pool for calculator lot-from-url.

Scrapers keep permanent tabs. Calculator opens short-lived tabs only,
with a hard concurrency cap so ~10 users do not spawn 10 Copart pages.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

from playwright.async_api import Browser, Page, Playwright, async_playwright

from app.config import get_settings
from app.scraper.browser import get_shared_context, launch_chromium

logger = logging.getLogger("mg.pricing.calc_chrome")

T = TypeVar("T")

# Concurrent calculator tabs in the shared Chrome window.
# Scrapers already use ~5–6 tabs — keep calc headroom small.
_DEFAULT_MAX_CONCURRENT = 3
_DEFAULT_TIMEOUT_SEC = 14.0


class CalcChromePool:
    def __init__(self) -> None:
        self._sem: asyncio.Semaphore | None = None
        self._lock = asyncio.Lock()
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self._inflight = 0

    def _max_concurrent(self) -> int:
        settings = get_settings()
        raw = getattr(settings, "calc_chrome_max_concurrent", None)
        try:
            n = int(raw) if raw is not None else _DEFAULT_MAX_CONCURRENT
        except (TypeError, ValueError):
            n = _DEFAULT_MAX_CONCURRENT
        return max(1, min(n, 6))

    def _timeout_sec(self) -> float:
        settings = get_settings()
        raw = getattr(settings, "calc_chrome_timeout_sec", None)
        try:
            n = float(raw) if raw is not None else _DEFAULT_TIMEOUT_SEC
        except (TypeError, ValueError):
            n = _DEFAULT_TIMEOUT_SEC
        return max(6.0, min(n, 30.0))

    def _ensure_sem(self) -> asyncio.Semaphore:
        if self._sem is None:
            self._sem = asyncio.Semaphore(self._max_concurrent())
        return self._sem

    async def _ensure_browser(self) -> Browser:
        async with self._lock:
            if self._browser is not None:
                try:
                    if self._browser.is_connected():
                        return self._browser
                except Exception:
                    pass
                self._browser = None

            settings = get_settings()
            cdp = (settings.scraper_cdp_url or "").strip() or "http://127.0.0.1:9223"

            if self._pw is not None:
                try:
                    await self._pw.stop()
                except Exception:
                    pass
                self._pw = None

            self._pw = await async_playwright().start()
            # Quick attach — do not wait 50s / restart Chrome (scrapers own that).
            try:
                browser = await self._pw.chromium.connect_over_cdp(cdp, timeout=8_000)
                browser._mg_via_cdp = True  # type: ignore[attr-defined]
                logger.info("calc chrome attached via CDP %s", cdp)
            except Exception as exc:
                logger.warning("calc chrome quick CDP failed (%s) — launch_chromium", exc)
                browser = await launch_chromium(
                    self._pw,
                    headless=settings.scraper_headless,
                    cdp_url=cdp,
                    cdp_autostart=False,
                    cdp_fallback_launch=False,
                    cdp_headless=settings.scraper_cdp_headless,
                )
            self._browser = browser
            return browser

    async def _close_page(self, page: Page | None) -> None:
        if page is None:
            return
        try:
            if not page.is_closed():
                await page.close()
        except Exception as exc:
            logger.debug("calc tab close: %s", exc)

    @property
    def inflight(self) -> int:
        return self._inflight

    def busy(self) -> bool:
        """True when all calc slots are taken."""
        sem = self._ensure_sem()
        return int(getattr(sem, "_value", 0)) <= 0

    async def run(
        self,
        worker: Callable[[Page], Awaitable[T]],
        *,
        optional: bool = False,
    ) -> T | None:
        """Open one temp tab, run worker, always close the tab.

        optional=True: if Chrome is already at capacity, return None immediately
        (caller should serve catalog data — keeps 10 concurrent users responsive).
        """
        sem = self._ensure_sem()
        if optional:
            try:
                await asyncio.wait_for(sem.acquire(), timeout=0.05)
            except asyncio.TimeoutError:
                logger.info(
                    "calc chrome at capacity (inflight=%s) — skip optional enrich",
                    self._inflight,
                )
                return None
        else:
            await sem.acquire()

        self._inflight += 1
        page: Page | None = None
        try:

            async def _work() -> T:
                nonlocal page
                browser = await self._ensure_browser()
                ctx = await get_shared_context(browser)
                page = await ctx.new_page()
                logger.info(
                    "calc tab opened (inflight=%s pages≈%s)",
                    self._inflight,
                    len(ctx.pages),
                )
                return await worker(page)

            return await asyncio.wait_for(_work(), timeout=self._timeout_sec())
        except asyncio.TimeoutError:
            logger.warning("calc chrome timed out after %.0fs", self._timeout_sec())
            raise
        finally:
            await self._close_page(page)
            self._inflight = max(0, self._inflight - 1)
            sem.release()
            logger.info("calc tab closed (inflight=%s)", self._inflight)


_pool: CalcChromePool | None = None


def get_calc_chrome_pool() -> CalcChromePool:
    global _pool
    if _pool is None:
        _pool = CalcChromePool()
    return _pool
