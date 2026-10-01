"""Shared Chrome CDP pool for calculator lot-from-url.

Prefer the scraper's permanent ``lot_lookup`` tab (same Playwright session).
This pool is only a fallback when the scraper browser is down — it reuses one
permanent tab instead of ``new_page``+close (second CDP + new tabs often die
with ``Connection closed``).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

from playwright.async_api import Browser, Page, Playwright, async_playwright

from app.config import get_settings
from app.scraper.browser import get_shared_context, launch_chromium, mark_agent_tab, open_agent_tab

logger = logging.getLogger("mg.pricing.calc_chrome")

T = TypeVar("T")

_DEFAULT_MAX_CONCURRENT = 2
_DEFAULT_TIMEOUT_SEC = 28.0
_LOOKUP_LABEL = "lot_lookup"

_DEAD_CONN = (
    "connection closed",
    "target closed",
    "browser has been closed",
    "browser closed",
    "not connected",
    "websocket",
    "econnrefused",
)


def _is_dead_conn(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return any(token in msg for token in _DEAD_CONN)


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
        return max(1, min(n, 4))

    def _timeout_sec(self) -> float:
        settings = get_settings()
        raw = getattr(settings, "calc_chrome_timeout_sec", None)
        try:
            n = float(raw) if raw is not None else _DEFAULT_TIMEOUT_SEC
        except (TypeError, ValueError):
            n = _DEFAULT_TIMEOUT_SEC
        return max(6.0, min(n, 45.0))

    def _ensure_sem(self) -> asyncio.Semaphore:
        if self._sem is None:
            self._sem = asyncio.Semaphore(self._max_concurrent())
        return self._sem

    async def _drop_browser(self) -> None:
        """Forget stale CDP handle so the next call re-attaches."""
        async with self._lock:
            self._browser = None
            if self._pw is not None:
                try:
                    await self._pw.stop()
                except Exception:
                    pass
                self._pw = None

    async def _ensure_browser(self, *, force: bool = False) -> Browser:
        async with self._lock:
            if force:
                self._browser = None

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

    @property
    def inflight(self) -> int:
        return self._inflight

    def busy(self) -> bool:
        sem = self._ensure_sem()
        return int(getattr(sem, "_value", 0)) <= 0

    async def run(
        self,
        worker: Callable[[Page], Awaitable[T]],
        *,
        optional: bool = False,
    ) -> T | None:
        """Reuse permanent ``lot_lookup`` tab — do not open/close disposable pages."""
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
        try:

            async def _work(*, force_reconnect: bool) -> T:
                browser = await self._ensure_browser(force=force_reconnect)
                ctx = await get_shared_context(browser)
                page = await open_agent_tab(ctx, label=_LOOKUP_LABEL, url=None)
                try:
                    await page.bring_to_front()
                except Exception:
                    pass
                logger.info(
                    "calc lot_lookup tab ready (inflight=%s pages≈%s reconnect=%s)",
                    self._inflight,
                    len(ctx.pages),
                    force_reconnect,
                )
                result = await worker(page)
                try:
                    await mark_agent_tab(page, _LOOKUP_LABEL)
                except Exception:
                    pass
                return result

            try:
                return await asyncio.wait_for(
                    _work(force_reconnect=False),
                    timeout=self._timeout_sec(),
                )
            except asyncio.TimeoutError:
                logger.warning("calc chrome timed out after %.0fs", self._timeout_sec())
                raise
            except Exception as exc:
                if not _is_dead_conn(exc):
                    raise
                logger.warning("calc chrome dead pipe — reconnect once: %s", exc)
                await self._drop_browser()
                return await asyncio.wait_for(
                    _work(force_reconnect=True),
                    timeout=self._timeout_sec(),
                )
        finally:
            self._inflight = max(0, self._inflight - 1)
            sem.release()
            logger.info("calc lot_lookup done (inflight=%s)", self._inflight)


_pool: CalcChromePool | None = None


def get_calc_chrome_pool() -> CalcChromePool:
    global _pool
    if _pool is None:
        _pool = CalcChromePool()
    return _pool
