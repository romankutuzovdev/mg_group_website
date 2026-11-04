from __future__ import annotations

import unittest

from app.models.lots import AuctionLot
from app.routers.content import _clean_model, pick_case_lots


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
            _lot("ok", "Toyota"),
        ]
        self.assertEqual([l.id for l in pick_case_lots(lots, 10)], ["ok"])

    def test_one_per_make_before_repeats(self):
        lots = [_lot(f"t{i}", "Toyota") for i in range(3)] + [_lot("h", "Honda"), _lot("f", "Ford")]
        self.assertEqual([l.make for l in pick_case_lots(lots, 3)], ["Toyota", "Honda", "Ford"])

    def test_uk_bid_is_converted(self):
        self.assertEqual(pick_case_lots([_lot("uk", "Ford", bid=9900, region="uk", currency="GBP")], 3), [])

    def test_repeated_make_is_removed_from_model(self):
        self.assertEqual(_clean_model(_lot("a", "Nissan", model="Nissan Gt-r")), "Gt-r")
