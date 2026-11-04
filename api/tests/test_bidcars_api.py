from __future__ import annotations

import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from app.scraper import bidcars
from app.scraper.mapper import map_bidcars_row

# Real shape of one /app/search/request item (trimmed).
ACTIVE_ITEM = {
    "loss_type": "---",
    "primary_damage": "Rear end",
    "start_code": "Starts",
    "seller": "Insurance Company",
    "seller_long": "Insurance Company",
    "name": "2023 Nissan Rogue, SV",
    "name_long": "2023 Nissan Rogue, SV",
    "tag": "2023-Nissan-Rogue-JN8BT3BB2PW200454",
    "lot": "1-70290456",
    "vin": "JN8BT3BB2PW200454",
    "type": "Automobile",
    "odometer": 36621,
    "location": "Madison South (WI)",
    "sale_document": "SC",
    "sale_document_split": "SC (Wisconsin)",
    "prebid_close_time_lang": {"en": "Tue 3 Nov, 19:00 GMT+1"},
    "time_left": 570,
    "prebid_price": "$3,050",
    "final_bid": None,
    "buy_now_close_time": 0,
    "buy_now_price": None,
    "status": 0,
    "search_status": "active",
    "estimated_min": 4960,
    "estimated_max": 8390,
    "specs": {
        "key_info": "Present",
        "transmission": 0,
        "hybrid": None,
        "fuel_type": "0",
        "drive_type": 2,
        "engine_rendered": "1.5L, I3, ",
    },
    "img": {
        "img_1": "https://images.bid.cars/170290456_x/2023-Nissan-Rogue-1.jpg",
    },
    "img_large": {
        "img_3": "https://pluto.bid.car/1-70290456/2023-Nissan-Rogue-JN8BT3BB2PW200454-3.jpg",
        "img_1": "https://pluto.bid.car/1-70290456/2023-Nissan-Rogue-JN8BT3BB2PW200454-1.jpg",
        "img_2": "https://pluto.bid.car/1-70290456/2023-Nissan-Rogue-JN8BT3BB2PW200454-2.jpg",
    },
}

ENDED_ITEM = {
    **ACTIVE_ITEM,
    "lot": "0-46227663",
    "tag": "2026-Ford-Mustang-1FA6P8TH8T5113326",
    "name_long": "2026 Ford Mustang, Ecoboost Premium...",
    "vin": "1FA6P8TH8T5113326",
    "time_left": "0",
    "prebid_price": "$4,600",
    "final_bid": 6300,
    "buy_now_price": "$15,350",
    "status": 2,
    "search_status": "ended",
    "specs": {"key_info": "Present", "transmission": 1, "hybrid": 1, "fuel_type": "0", "drive_type": 1},
}


class RowFromApiItemTests(unittest.TestCase):
    def test_active_lot_maps_all_fields(self):
        now = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
        row = bidcars.row_from_api_item(ACTIVE_ITEM, now=now)
        self.assertIsNotNone(row)
        self.assertEqual(row["lotNumber"], "1-70290456")
        self.assertEqual(
            row["url"], "https://bid.cars/en/lot/1-70290456/2023-Nissan-Rogue-JN8BT3BB2PW200454"
        )
        self.assertEqual(row["price"], "3050")
        self.assertEqual(row["buyNowPrice"], "")
        self.assertEqual((row["estimatedMin"], row["estimatedMax"]), ("4960", "8390"))
        self.assertFalse(row["sold"])
        # gallery ordered by img_N index, large variant preferred
        self.assertEqual(
            [u[-5:] for u in row["images"]], ["1.jpg", "2.jpg", "3.jpg"]
        )
        self.assertIn("pluto.bid.car", row["image"])
        self.assertEqual(row["auctionDate"], (now + timedelta(seconds=570)).isoformat())
        self.assertEqual((row["transmission"], row["fuel"], row["drive"]), ("Automatic", "Gasoline", "AWD"))
        self.assertEqual(row["engine"], "1.5L, I3")
        self.assertTrue(row["hasKeys"])
        self.assertTrue(row["runsDrives"])
        self.assertEqual(row["lossType"], "")
        self.assertEqual(row["saleDocument"], "SC (Wisconsin)")
        self.assertTrue(row["photosEnrichedAt"])

        lot = map_bidcars_row(row)
        self.assertIsNotNone(lot)
        self.assertEqual(lot.id, "usa-bidcars-1-70290456")
        self.assertEqual((lot.year, lot.make, lot.model), (2023, "Nissan", "Rogue"))
        self.assertEqual(lot.currentBid, 3050.0)
        self.assertEqual(lot.estimatedCostMax, 8390.0)
        self.assertEqual(lot.region, "usa")
        self.assertEqual(lot.source, "bidcars")
        self.assertEqual(lot.photoCount, 3)

    def test_ended_lot_is_sold_with_final_bid(self):
        row = bidcars.row_from_api_item(ENDED_ITEM)
        self.assertTrue(row["sold"])
        self.assertEqual(row["price"], "6300")
        self.assertEqual(row["buyNowPrice"], "15350")
        self.assertEqual((row["transmission"], row["fuel"], row["drive"]), ("Manual", "Hybrid", "RWD"))
        lot = map_bidcars_row(row)
        self.assertTrue(lot.sold)
        self.assertEqual((lot.year, lot.make, lot.model), (2026, "Ford", "Mustang"))

    def test_live_lot_without_timer_gets_short_auction_date(self):
        now = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
        row = bidcars.row_from_api_item(
            {**ACTIVE_ITEM, "time_left": "0", "search_status": "live", "status": 1}, now=now
        )
        self.assertFalse(row["sold"])
        self.assertEqual(row["auctionDate"], (now + timedelta(hours=2)).isoformat())

    def test_live_status_2_is_not_sold(self):
        row = bidcars.row_from_api_item({**ACTIVE_ITEM, "status": 2, "search_status": "live", "time_left": "0"})
        self.assertFalse(row["sold"])

    def test_skips_items_without_images_or_lot(self):
        self.assertIsNone(bidcars.row_from_api_item({**ACTIVE_ITEM, "img": {}, "img_large": {}}))
        self.assertIsNone(bidcars.row_from_api_item({**ACTIVE_ITEM, "lot": ""}))
        self.assertIsNone(bidcars.row_from_api_item({**ACTIVE_ITEM, "type": "Motorcycle"}))


class HelpersTests(unittest.TestCase):
    def test_search_url(self):
        url = bidcars.api_search_url(status="Active", auction_type="IAAI", year_from=2020, year_to=2021, page=7)
        self.assertTrue(url.startswith("/app/search/request?"))
        for part in ("status=Active", "auction-type=IAAI", "year-from=2020", "year-to=2021", "page=7", "type=Automobile"):
            self.assertIn(part, url)

    def test_body_kind(self):
        self.assertEqual(bidcars._api_body_kind(200, '{"data":[]}'), "ok")
        self.assertEqual(bidcars._api_body_kind(200, ""), "empty")
        self.assertEqual(bidcars._api_body_kind(403, "<html>Just a moment...</html>"), "cloudflare")
        self.assertEqual(bidcars._api_body_kind(200, "<!DOCTYPE html><title>Just a moment</title>"), "cloudflare")
        self.assertEqual(bidcars._api_body_kind(502, "Bad gateway"), "error")
        self.assertEqual(bidcars._api_body_kind(0, ""), "error")

    def test_sweep_plan_partitions(self):
        settings = SimpleNamespace(
            scraper_bidcars_statuses="Active,Live",
            scraper_bidcars_auction_types="Copart,IAAI",
            scraper_bidcars_year_ranges="1900-2012, 2013-2027",
        )
        plan = bidcars._sweep_plan(settings)
        self.assertEqual(len(plan), 5)
        self.assertEqual(plan[0], {"status": "Active", "auction_type": "Copart", "year_from": 1900, "year_to": 2012})
        self.assertEqual(plan[-1]["status"], "Live")
        self.assertEqual(plan[-1]["auction_type"], "All")

    def test_sweep_plan_accepts_single_years_and_live_first(self):
        plan = bidcars._sweep_plan(SimpleNamespace(
            scraper_bidcars_statuses="Live,Active",
            scraper_bidcars_auction_types="Copart",
            scraper_bidcars_year_ranges="2010-2012,2020",
        ))
        self.assertEqual(plan[0]["status"], "Live")
        self.assertEqual((plan[2]["year_from"], plan[2]["year_to"]), (2020, 2020))

    def test_sweep_plan_defaults_when_empty(self):
        plan = bidcars._sweep_plan(SimpleNamespace(scraper_bidcars_statuses="", scraper_bidcars_auction_types="", scraper_bidcars_year_ranges=""))
        self.assertEqual(plan, [{"status": "Active", "auction_type": "All", "year_from": 1900, "year_to": 2027}])


class _FakeTab:
    """Minimal Playwright Page stand-in: pages 1-2 have data, page 3 is empty."""

    def __init__(self, responses=None):
        self.url = "https://bid.cars/en/search/results?x=1"
        self.context = SimpleNamespace(browser=None)
        self.calls: list[str] = []
        self.responses = responses

    async def goto(self, *a, **k):
        return None

    async def wait_for_timeout(self, ms):
        return None

    async def evaluate(self, script, arg=None):
        if "document.body" in script:  # _blocked_reason
            return ""
        url = arg["url"]
        self.calls.append(url)
        if self.responses is not None:
            return self.responses(url)
        page = int(url.rsplit("page=", 1)[1])
        if page >= 3:
            return {"status": 200, "text": ""}
        items = []
        for i in range(50):
            items.append({**ACTIVE_ITEM, "lot": f"1-{page}{i:04d}", "tag": f"2023-Nissan-Rogue-VIN{page}{i}"})
        return {"status": 200, "text": json.dumps({"data": items, "current_page": page})}


class ScrapeApiTests(unittest.TestCase):
    def _run(self, tab, **kw):
        async def _go():
            return await bidcars.scrape_bidcars_api(page=tab, delay_ms=0, **kw)

        return asyncio.run(_go())

    def test_sweeps_pages_until_empty_and_upserts(self):
        tab = _FakeTab()
        upserts: list[int] = []

        def fake_upsert(lots):
            upserts.append(len(lots))
            return len(lots), len(lots)

        plan = [{"status": "Active", "auction_type": "Copart", "year_from": 1900, "year_to": 2027}]
        with patch.object(bidcars.lot_store, "upsert_many", side_effect=fake_upsert), patch.object(
            bidcars.lot_store, "persist", return_value=0
        ):
            result = self._run(tab, plan=plan, max_pages=10)
        self.assertEqual(len(tab.calls), 3)  # p1, p2, p3(empty) → stop
        self.assertEqual(upserts, [50, 50])
        self.assertTrue(result[0]["_ok"])
        self.assertEqual(result[0]["unique"], 100)
        self.assertEqual(result[0]["upserted"], 100)

    def test_cloudflare_once_retries_same_page(self):
        hits = {"n": 0}

        def responder(url):
            hits["n"] += 1
            if hits["n"] == 2:  # first attempt at page 2 → challenge
                return {"status": 403, "text": "<html>Just a moment</html>"}
            page = int(url.rsplit("page=", 1)[1])
            if page >= 3:
                return {"status": 200, "text": ""}
            items = [{**ACTIVE_ITEM, "lot": f"1-{page}{i:04d}"} for i in range(50)]
            return {"status": 200, "text": json.dumps({"data": items})}

        tab = _FakeTab(responses=responder)
        plan = [{"status": "Active", "auction_type": "All", "year_from": 1900, "year_to": 2027}]
        with patch.object(bidcars.lot_store, "upsert_many", side_effect=lambda lots: (len(lots), 0)), patch.object(
            bidcars.lot_store, "persist", return_value=0
        ):
            result = self._run(tab, plan=plan, max_pages=5)
        pages = [int(u.rsplit("page=", 1)[1]) for u in tab.calls]
        self.assertEqual(pages, [1, 2, 2, 3])
        self.assertEqual(result[0]["unique"], 100)

    def test_cloudflare_twice_returns_blocked(self):
        tab = _FakeTab(responses=lambda url: {"status": 403, "text": "<html>Just a moment</html>"})
        plan = [{"status": "Active", "auction_type": "All", "year_from": 1900, "year_to": 2027}]
        with patch.object(bidcars.lot_store, "persist", return_value=0):
            result = self._run(tab, plan=plan, max_pages=5)
        self.assertEqual(result, [{"_blocked": True, "reason": "cloudflare"}])

    def test_entry_point_prefers_json(self):
        tab = _FakeTab()
        with patch.object(bidcars.lot_store, "upsert_many", return_value=(50, 50)), patch.object(
            bidcars.lot_store, "persist", return_value=0
        ), patch.object(bidcars, "scrape_bidcars_dom") as dom:
            async def _go():
                return await bidcars.scrape_bidcars(page=tab, max_pages=3)

            result = asyncio.run(_go())
        self.assertTrue(result[0]["_ok"])
        self.assertEqual(result[0].get("via"), "json")
        dom.assert_not_called()


if __name__ == "__main__":
    unittest.main()
