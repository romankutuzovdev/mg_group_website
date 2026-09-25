"""Playwright browser helpers — one Google Chrome, many tabs (pages).

For Windows: start Chrome with remote debugging, set SCRAPER_CDP_URL.
All agents attach to that Chrome and open separate tabs in the same window.
On API restart we reuse existing agent tabs (by title / label) — no duplicates.
"""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, Playwright

from app.scraper.chrome_cdp import ensure_chrome_cdp

logger = logging.getLogger("mg.scraper.browser")

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

TAB_TITLE_PREFIX = "MG · "


async def launch_chromium(
    pw: Playwright,
    *,
    headless: bool = True,
    cdp_url: str | None = None,
    cdp_autostart: bool = True,
    cdp_fallback_launch: bool = False,
    cdp_headless: bool = True,
) -> Browser:
    """Launch or attach Google Chrome.

    When ``cdp_url`` is set we *prefer* CDP and retry attach. Falling back to a
    fresh Playwright launch is opt-in (usually worse for bot walls on Windows).
    Failures never crash the API process — they raise so the supervisor can retry.
    """
    if cdp_url and cdp_url.strip():
        url = cdp_url.strip()
        last_exc: Exception | None = None
        for attempt in range(1, 4):
            ready = ensure_chrome_cdp(
                url,
                autostart=cdp_autostart,
                headless=cdp_headless,
                wait_seconds=50.0 if attempt == 1 else 30.0,
                force_restart=attempt > 1,
            )
            if not ready:
                last_exc = RuntimeError(f"Chrome CDP not ready at {url}")
                logger.warning("CDP ensure attempt %s failed", attempt)
                continue
            try:
                browser = await pw.chromium.connect_over_cdp(url, timeout=25_000)
                logger.info("browser attached via CDP %s (attempt %s)", url, attempt)
                browser._mg_via_cdp = True  # type: ignore[attr-defined]
                return browser
            except Exception as exc:
                last_exc = exc
                logger.warning("CDP attach attempt %s failed: %s", attempt, exc)

        if not cdp_fallback_launch:
            raise RuntimeError(
                f"Could not attach Chrome CDP at {url} after retries: {last_exc}"
            )
        logger.warning("CDP exhausted — falling back to Playwright launch")

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


def _title_for(label: str) -> str:
    return f"{TAB_TITLE_PREFIX}{label}"


async def mark_agent_tab(page: Page, label: str) -> None:
    """Stamp tab so we can find it again after API restart / navigations."""
    page._mg_agent = label  # type: ignore[attr-defined]
    title = _title_for(label)
    try:
        # Survives in-page navigations on this tab
        await page.add_init_script(
            f"window.__MG_AGENT = {label!r};"
        )
    except Exception:
        pass
    try:
        await page.evaluate(
            """({ label, title }) => {
              try { window.__MG_AGENT = label; } catch (e) {}
              try { document.title = title; } catch (e) {}
            }""",
            {"label": label, "title": title},
        )
    except Exception:
        pass


async def find_agent_tab(context: BrowserContext, label: str) -> Page | None:
    """Reuse an existing Chrome tab for this agent (no duplicates on restart)."""
    want = _title_for(label)
    for page in list(context.pages):
        if page.is_closed():
            continue
        if getattr(page, "_mg_agent", None) == label:
            return page
        try:
            stamped = await page.evaluate(
                "() => (typeof window !== 'undefined' && window.__MG_AGENT) || ''"
            )
        except Exception:
            stamped = ""
        if stamped == label:
            page._mg_agent = label  # type: ignore[attr-defined]
            return page
        try:
            title = await page.title()
        except Exception:
            continue
        if title == want or title.startswith(want + " ") or title.startswith(want + " ·"):
            page._mg_agent = label  # type: ignore[attr-defined]
            return page
    return None


async def open_agent_tab(
    context: BrowserContext,
    *,
    label: str,
    url: str | None = None,
) -> Page:
    """Open or reuse a tab in the shared Chrome window for one auction source."""
    existing = await find_agent_tab(context, label)
    if existing is not None:
        await mark_agent_tab(existing, label)
        logger.info(
            "reusing tab for agent=%s (pages=%s)",
            label,
            len(context.pages),
        )
        # Warm/navigate only if still blank and a target URL was given
        if url:
            try:
                cur = (existing.url or "").lower()
                if cur in {"", "about:blank", "chrome://newtab/"}:
                    await existing.goto(url, wait_until="domcontentloaded", timeout=60_000)
                    await mark_agent_tab(existing, label)
            except Exception as exc:
                logger.warning("agent tab %s warm (reuse) failed: %s", label, exc)
        return existing

    page = await context.new_page()
    await mark_agent_tab(page, label)
    if url:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            await mark_agent_tab(page, label)
        except Exception as exc:
            logger.warning("agent tab %s warm failed: %s", label, exc)
    logger.info("opened tab for agent=%s (pages=%s)", label, len(context.pages))
    return page


async def close_agent_tab(page: Page | None, *, force: bool = False) -> None:
    """Close a tab. For CDP-backed Chrome we keep tabs unless ``force``."""
    if page is None:
        return
    browser = page.context.browser
    via_cdp = bool(browser and getattr(browser, "_mg_via_cdp", False))
    if via_cdp and not force:
        logger.info(
            "keeping CDP tab open for agent=%s",
            getattr(page, "_mg_agent", "?"),
        )
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
