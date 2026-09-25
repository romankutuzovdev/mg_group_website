"""Playwright browser helpers — one Google Chrome, many tabs (pages).

For Windows: start Chrome with remote debugging, set SCRAPER_CDP_URL.
All agents attach to that Chrome and open separate tabs in the same window.
"""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, Playwright

logger = logging.getLogger("mg.scraper.browser")

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


async def launch_chromium(
    pw: Playwright,
    *,
    headless: bool = True,
    cdp_url: str | None = None,
) -> Browser:
    """Launch or attach Google Chrome.

    Order: CDP attach (if configured) → system Chrome → bundled Playwright.
    When attached via CDP, do not call browser.close() — leave Chrome open.
    """
    if cdp_url and cdp_url.strip():
        url = cdp_url.strip()
        try:
            browser = await pw.chromium.connect_over_cdp(url, timeout=15_000)
            logger.info("browser attached via CDP %s (shared Chrome tabs)", url)
            browser._mg_via_cdp = True  # type: ignore[attr-defined]
            return browser
        except Exception as exc:
            logger.warning("CDP attach failed (%s): %s — falling back to launch", url, exc)

    attempts: list[tuple[str, dict[str, Any]]] = [
        ("chrome", {"headless": headless, "channel": "chrome"}),
        ("bundled", {"headless": headless}),
    ]
    last_err: Exception | None = None
    for label, kwargs in attempts:
        try:
            browser = await pw.chromium.launch(**kwargs)
            logger.info("browser launched via %s", label)
            browser._mg_via_cdp = False  # type: ignore[attr-defined]
            return browser
        except Exception as exc:
            last_err = exc
            logger.warning("browser launch failed (%s): %s", label, exc)
    raise RuntimeError(f"Could not launch Chromium: {last_err}")


async def get_shared_context(browser: Browser) -> BrowserContext:
    """Single shared context = one Chrome window; new pages become tabs.

    CDP: reuse the default context of the user's already-open Chrome.
    Launch: create one persistent context and reuse it for all agents.
    """
    existing = browser.contexts
    if existing:
        ctx = existing[0]
        logger.info("using shared Chrome context (%s existing page(s))", len(ctx.pages))
        return ctx

    ctx = await browser.new_context(
        user_agent=DEFAULT_UA,
        locale="en-US",
        viewport={"width": 1440, "height": 900},
    )
    browser._mg_shared_context = ctx  # type: ignore[attr-defined]
    logger.info("created shared Chrome context for agent tabs")
    return ctx


async def open_agent_tab(
    context: BrowserContext,
    *,
    label: str,
    url: str | None = None,
) -> Page:
    """Open a new tab in the shared Chrome window for one auction source."""
    page = await context.new_page()
    page._mg_agent = label  # type: ignore[attr-defined]
    if url:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
        except Exception as exc:
            logger.warning("agent tab %s warm failed: %s", label, exc)
    logger.info("opened tab for agent=%s (pages=%s)", label, len(context.pages))
    return page


async def close_agent_tab(page: Page | None) -> None:
    if page is None:
        return
    try:
        await page.close()
    except Exception:
        pass


async def close_browser(browser: Browser | None) -> None:
    """Close only browsers we launched; leave CDP-attached Chrome alone."""
    if browser is None:
        return
    if getattr(browser, "_mg_via_cdp", False):
        logger.info("leaving CDP Google Chrome open (tabs stay)")
        return
    await browser.close()
