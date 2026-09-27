"""Copart UK — same in-page search as USA. context.request is blocked by Incapsula."""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Browser, Page

from app.scraper.copart_common import scrape_copart_inventory
from app.scraper.session import TabSession

logger = logging.getLogger("mg.scraper.copart_uk")

WARM_URL = "https://www.copart.co.uk/lotSearchResults/?free=true&query=*"


async def scrape_copart_uk(
    *,
    max_pages: int = 8,
    page_size: int = 100,
    headless: bool = True,
    timeout_ms: int = 60000,
    browser: Browser | None = None,
    page: Page | None = None,
) -> list[dict[str, Any]]:
    session = TabSession()
    tab = await session.start(page=page, browser=browser, headless=headless)
    try:
        lots = await scrape_copart_inventory(
            tab,
            origin="https://www.copart.co.uk",
            warm_url=WARM_URL,
            max_pages=max_pages,
            page_size=page_size,
            timeout_ms=timeout_ms,
        )
        logger.info("copart_uk done: %s lots", len(lots))
        return lots
    finally:
        await session.close()
