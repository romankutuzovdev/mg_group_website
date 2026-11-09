from __future__ import annotations

import unittest

from app.services.lot_lookup import bidcars_fees_payload


class BidcarsFeesPayloadTest(unittest.TestCase):
    def test_parses_tooltip_and_profile(self) -> None:
        info = {
            "profile": {"auctionType": "IAAI", "isHeavy": False, "customFees": "0"},
            "feesUsd": 1110,
            "atBid": 8000,
            "live": True,
            "tooltip": (
                "Buyer Fee: $800<br/>Internet Bid Fee: $160<br/>Service Fee: $105"
                "<br/>Environmental Fee: $25<br/>Title Handling Fee: $20"
            ),
        }
        out = bidcars_fees_payload(info)
        assert out is not None
        self.assertEqual(out["auctionType"], "iaai")
        self.assertFalse(out["isHeavy"])
        self.assertEqual(out["customFees"], "0")
        self.assertEqual(out["feesUsd"], 1110.0)
        self.assertEqual(out["atBid"], 8000.0)
        self.assertTrue(out["live"])
        self.assertEqual(
            [(l["label"], l["amount"]) for l in out["lines"]],
            [
                ("Buyer Fee", 800.0),
                ("Internet Bid Fee", 160.0),
                ("Service Fee", 105.0),
                ("Environmental Fee", 25.0),
                ("Title Handling Fee", 20.0),
            ],
        )

    def test_not_live_without_numbers(self) -> None:
        out = bidcars_fees_payload({"profile": {"auctionType": "Copart"}, "live": True})
        assert out is not None
        self.assertEqual(out["auctionType"], "copart")
        self.assertFalse(out["live"])
        self.assertEqual(out["lines"], [])

    def test_garbage(self) -> None:
        self.assertIsNone(bidcars_fees_payload(None))
        self.assertIsNone(bidcars_fees_payload("x"))


if __name__ == "__main__":
    unittest.main()
