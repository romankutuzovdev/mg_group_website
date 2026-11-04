from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from app.models.lots import AuctionLot
from app.services.auction_date import is_auction_ended

NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)


def _lot(when: str, *, source: str = "bidcars", sold: bool = False) -> AuctionLot:
    return AuctionLot(
        id="x", slug="x", region="usa", source=source, lotNumber="1",
        make="Ford", model="Mustang", year=2020, auctionDate=when, sold=sold,
    )


class BidcarsEndedTests(unittest.TestCase):
    def test_new_scraper_lot_ends_after_grace(self):
        lot = _lot((NOW - timedelta(hours=4)).isoformat())
        self.assertTrue(is_auction_ended(lot, now=NOW, grace_hours=3))

    def test_within_grace_stays(self):
        lot = _lot((NOW - timedelta(hours=2)).isoformat())
        self.assertFalse(is_auction_ended(lot, now=NOW, grace_hours=3))

    def test_old_scrape_clock_date_is_never_trusted(self):
        self.assertFalse(is_auction_ended(_lot("2026-10-20T10:00:00+00:00"), now=NOW, grace_hours=3))

    def test_empty_date_and_sold_stay(self):
        self.assertFalse(is_auction_ended(_lot(""), now=NOW, grace_hours=3))
        self.assertFalse(
            is_auction_ended(_lot("2026-11-05T10:00:00+00:00", sold=True), now=NOW, grace_hours=3)
        )

    def test_other_sources_unchanged(self):
        self.assertTrue(
            is_auction_ended(_lot("2026-10-20T10:00:00+00:00", source="encar"), now=NOW, grace_hours=3)
        )
