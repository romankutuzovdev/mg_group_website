"""Session helpers: reuse one Chrome tab (Page) per agent."""

from __future__ import annotations

from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

from app.scraper.browser import (
    close_agent_tab,
    close_browser,
    get_shared_context,
    launch_chromium,
)


class TabSession:
    """Owns optional local browser; always exposes a Page for scraping."""

    def __init__(self) -> None:
        self.pw: Any = None
        self.browser: Browser | None = None
        self.context: BrowserContext | None = None
        self.page: Page | None = None
        self.own_page = False
        self.own_browser = False

    async def start(
        self,
        *,
        page: Page | None = None,
        browser: Browser | None = None,
        headless: bool = True,
        cdp_url: str | None = None,
    ) -> Page:
        if page is not None:
            self.page = page
            self.own_page = False
            self.context = page.context
            self.browser = page.context.browser
            return page

        if browser is None:
            self.pw = await async_playwright().start()
            self.browser = await launch_chromium(
                self.pw,
                headless=headless,
                cdp_url=cdp_url,
                cdp_autostart=True,
                cdp_fallback_launch=False,
                cdp_headless=True,
            )
            self.own_browser = True
        else:
            self.browser = browser

        self.context = await get_shared_context(self.browser)
        self.page = await self.context.new_page()
        self.own_page = True
        return self.page

    async def close(self) -> None:
        if self.own_page:
            await close_agent_tab(self.page)
        self.page = None
        if self.own_browser:
            await close_browser(self.browser)
            if self.pw is not None:
                await self.pw.stop()
            self.browser = None
            self.pw = None
