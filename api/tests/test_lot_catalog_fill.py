from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.data.store import lot_store
from app.models.lots import AuctionLot
from app.routers.pricing import LotFromUrlRequest, lot_from_url
from app.services.lot_lookup import (
    extract_lot_number,
    fill_from_catalog,
    lookup_in_production_catalog,
    soft_lot_payload,
)

URL = "https://bid.cars/en/lot/1-69128766/2024-Ford-Transit-1FTBR3UG0RKA85625"
CATALOG = {
    "bid": 5000.0,
    "vin": "CATALOGVIN",
    "engine": "3.5L, V6",
    "fuel": "Gasoline",
    "images": ["https://cdn/1.jpg"],
}


class LotNumberTests(unittest.TestCase):
    def test_bidcars_prefix_is_not_the_lot_number(self):
        self.assertEqual(extract_lot_number(URL, "bidcars"), "69128766")
        self.assertEqual(
            extract_lot_number("https://bid.cars/en/lot/0-46241898/x", "bidcars"),
            "46241898",
        )


class FillFromCatalogTests(unittest.TestCase):
    def test_failed_proxy_gets_specs_from_catalog(self):
        soft = soft_lot_payload(URL, "scraper_proxy_failed:ReadTimeout")
        soft["via"] = "scraper_proxy_failed"
        out = fill_from_catalog(soft, URL, CATALOG)
        self.assertTrue(out["ok"])
        self.assertEqual(out["via"], "catalog")
        self.assertEqual(out["engine"], "3.5L, V6")
        self.assertEqual(out["bid"], 5000.0)
        self.assertFalse(out["bidLive"])
        self.assertNotIn("error", out)

    def test_live_values_win_and_via_stays(self):
        live = {
            "ok": True,
            "proxied": True,
            "via": "lot_lookup_tab",
            "bid": 7000.0,
            "bidLive": True,
            "vin": "LIVEVIN",
            "engine": None,
        }
        out = fill_from_catalog(live, URL, CATALOG)
        self.assertEqual(out["vin"], "LIVEVIN")
        self.assertEqual(out["bid"], 7000.0)
        self.assertTrue(out["bidLive"])
        self.assertEqual(out["engine"], "3.5L, V6")
        self.assertEqual(out["via"], "lot_lookup_tab")

    def test_catalog_corrects_page_parsing_errors(self):
        live = {
            "ok": True,
            "proxied": True,
            "via": "lot_lookup_tab",
            "bid": 0.0,
            "bidLive": True,
            "odometer": 49,
            "drive": "Key",
        }
        catalog = {"bid": 4300.0, "odometer": 49549, "odometerUnit": "mi", "drive": "AWD"}
        out = fill_from_catalog(live, URL, catalog)
        self.assertEqual(out["odometer"], 49549)
        self.assertEqual(out["drive"], "AWD")
        self.assertEqual(out["bid"], 4300.0)
        self.assertFalse(out["bidLive"])

    def test_garbage_drive_dropped_without_catalog(self):
        live = {"ok": True, "proxied": True, "via": "lot_lookup_tab", "drive": "45E"}
        self.assertIsNone(fill_from_catalog(live, URL, None)["drive"])

    def test_no_catalog_keeps_failure_visible(self):
        soft = soft_lot_payload(URL, "x")
        soft["via"] = "scraper_proxy_failed"
        out = fill_from_catalog(soft, URL, None)
        self.assertFalse(out["ok"])
        self.assertEqual(out["via"], "scraper_proxy_failed")
        self.assertEqual(out["lotNumber"], "69128766")


class RouterTests(unittest.TestCase):
    def _lot(self):
        lot = AuctionLot.model_construct(
            id="usa-bidcars-1-69128766",
            slug="x",
            region="usa",
            source="bidcars",
            lotNumber="1-69128766",
            vin="1FTBR3UG0RKA85625",
            make="Ford",
            model="Transit",
            year=2024,
            engine="3.5L, V6",
            fuel="Gasoline",
            transmission="Automatic",
            drive="Rear",
            exteriorColor="",
            primaryDamage="Front End",
            odometer=1000,
            currentBid=5000.0,
            imageUrl="https://cdn/1.jpg",
            imageUrls=[],
            location="TX",
            lotUrl=URL,
            category=None,
            bodyStyle=None,
            inlandMiles=None,
            currency="USD",
            titleLabel="Clear",
            odometerUnit="mi",
            secondaryDamage=None,
            lossType="Collision",
            startCode="Run / Drive",
            keyInfo="Present",
            saleDocument="Salvage (Texas)",
            seller="Hanover Insurance",
        )
        return lot

    def test_prefixed_bidcars_lot_found(self):
        with patch.object(lot_store, "find_by_lot_number", return_value=self._lot()) as find:
            found = lookup_in_production_catalog(URL)
        find.assert_called_once_with("1-69128766")
        self.assertEqual(found["engine"], "3.5L, V6")
        self.assertEqual(found["cylinders"], "6")
        self.assertEqual(found["odometer"], 1000)
        self.assertEqual(found["odometerUnit"], "mi")
        self.assertEqual(found["startCode"], "Run / Drive")
        self.assertEqual(found["saleDocument"], "Salvage (Texas)")
        self.assertEqual(found["seller"], "Hanover Insurance")

    def test_direct_copart_link_finds_bidcars_lot(self):
        found_lot = self._lot()

        def find(number, **_):
            return found_lot if number == "1-69128766" else None

        with patch.object(lot_store, "find_by_lot_number", side_effect=find):
            found = lookup_in_production_catalog("https://www.copart.com/lot/69128766")
        self.assertEqual(found["vin"], "1FTBR3UG0RKA85625")

    def test_zero_catalog_bid_is_not_a_price(self):
        lot = self._lot()
        lot.currentBid = 0.0
        with patch.object(lot_store, "find_by_lot_number", return_value=lot):
            self.assertIsNone(lookup_in_production_catalog(URL)["bid"])

    def test_hung_windows_returns_catalog_specs(self):
        with (
            patch.object(lot_store, "find_by_lot_number", return_value=self._lot()),
            patch("app.services.scraper_proxy.should_proxy_lot_lookup", return_value=True),
            patch(
                "app.services.scraper_proxy.proxy_lot_from_url",
                AsyncMock(side_effect=RuntimeError("scraper_unreachable:ReadTimeout")),
            ) as proxy,
        ):
            out = asyncio.run(lot_from_url(LotFromUrlRequest(url=URL)))
        self.assertEqual(proxy.await_args.kwargs["timeout_seconds"], 30.0)
        self.assertTrue(out["ok"])
        self.assertEqual(out["via"], "catalog")
        self.assertEqual(out["vin"], "1FTBR3UG0RKA85625")
        self.assertEqual(out["engine"], "3.5L, V6")
        self.assertEqual(out["lotNumber"], "69128766")


if __name__ == "__main__":
    unittest.main()
