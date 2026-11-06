from __future__ import annotations

import unittest

from app.data.store import LotStore
from app.models.lots import AuctionLot
from unittest.mock import patch

from app.routers import content
from app.routers.content import _case_price, _clean_model, pick_case_lots


def _lot(lot_id, make, *, bid=5000.0, year=2019, region="usa", currency="USD", model="Rogue", sold=False):
    return AuctionLot(
        id=lot_id, slug=lot_id, region=region, source="bidcars", lotNumber=lot_id, make=make,
        model=model, year=year, currentBid=bid, currency=currency, imageUrl="https://x/a.jpg", sold=sold,
    )


class PickCaseLotsTests(unittest.TestCase):
    def test_luxury_korea_sold_and_extremes_are_out(self):
        lots = [
            _lot("rr", "Rolls-royce"),
            _lot("kr", "Kia", region="korea", currency="USD"),
            _lot("sold", "Toyota", sold=True),
            _lot("cheap", "Toyota", bid=100),
            _lot("dear", "Toyota", bid=50000),
            _lot("old", "Toyota", year=2005),
            _lot("new", "Toyota", year=2026),
            _lot("ok", "Toyota"),
        ]
        self.assertEqual([l.id for l in pick_case_lots(lots, 10)], ["ok"])

    def test_one_per_make_before_repeats(self):
        lots = [_lot(f"t{i}", "Toyota") for i in range(3)] + [_lot("h", "Honda"), _lot("f", "Ford")]
        self.assertEqual([l.make for l in pick_case_lots(lots, 3)], ["Toyota", "Honda", "Ford"])

    def test_uk_price_is_converted(self):
        self.assertEqual(pick_case_lots([_lot("uk", "Ford", bid=12000, region="uk", currency="GBP")], 3), [])

    def test_estimated_range_beats_opening_bid(self):
        lot = _lot("a", "Toyota", bid=200)
        lot.estimatedCostMin, lot.estimatedCostMax = 8000, 12000
        self.assertEqual(_case_price(lot), 10000)
        self.assertEqual(pick_case_lots([lot], 3), [lot])

    def test_route_returns_cases(self):
        lots = [_lot("a", "Toyota"), _lot("b", "Honda", model="Honda Civic")]
        store = LotStore(":memory:")
        store.upsert_many(lots)
        with patch.object(content, "lot_store", store):
            out = content.cases(limit=2)
        self.assertEqual(out["count"], 2)
        self.assertEqual(out["items"][1]["title"], "Honda Civic 2019")
        self.assertEqual(out["items"][0]["region"], "США")
        self.assertGreater(out["items"][0]["budget"], 5000)

    def test_repeated_make_is_removed_from_model(self):
        self.assertEqual(_clean_model(_lot("a", "Nissan", model="Nissan Gt-r")), "Gt-r")
