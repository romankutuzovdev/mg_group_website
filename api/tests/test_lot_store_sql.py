from __future__ import annotations

import json
import random
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.data.store import LotStore
from app.models.lots import AuctionLot
from app.services.auction_date import active_lots
from app.services.filter_lots import LotFilters, filter_lots

NOW = datetime.now(timezone.utc)
SETTINGS = SimpleNamespace(
    lots_json_path="unused.json", scraper_prune_ended=True, scraper_auction_grace_hours=2
)


def _lot(lot_id: str, **fields) -> AuctionLot:
    base = dict(
        id=lot_id, slug=lot_id, region="korea", source="encar", lotNumber=lot_id,
        make="Ford", model="Mustang", year=2020,
        auctionDate=(NOW + timedelta(days=3)).isoformat(),
    )
    return AuctionLot(**{**base, **fields})


def _random_lots(count: int) -> list[AuctionLot]:
    rng = random.Random(7)
    makes = ["Ford", "BMW", "Škoda", "ТОЙОТА", "kia "]
    models = ["Mustang", "X5 3.0L", "Octavia 1.6 л", "Камри 2500cc", "Rio"]
    specs = ["", "—", "Gasoline", "Diesel", "Hybrid Gasoline", "Automatic", "AWD", "FWD"]
    out = []
    for i in range(count):
        region, source = rng.choice(
            [("usa", "bidcars"), ("usa", "copart"), ("uk", "copart_uk"),
             ("korea", "encar"), ("china", "china_market")]
        )
        days = rng.choice([-30, -1, 2, 9])
        out.append(
            _lot(
                f"lot-{i}", region=region, source=source, make=rng.choice(makes),
                model=rng.choice(models), year=rng.randint(2005, 2026),
                currentBid=rng.choice([0, 500, 1500, 9000, 40000]),
                buyNowPrice=rng.choice([None, 0, 2000]),
                odometer=rng.randint(0, 300000), odometerUnit=rng.choice(["km", "mi"]),
                fuel=rng.choice(specs), drive=rng.choice(specs), transmission=rng.choice(specs),
                primaryDamage=rng.choice(["", "Front End", "ГРАД"]),
                secondaryDamage=rng.choice([None, "Rear End"]),
                bodyStyle=rng.choice([None, "Sedan", "SUV"]),
                engine=rng.choice([None, "2.0L", "1800cc"]),
                titleType=rng.choice(["clean", "salvage"]),
                runsDrives=rng.random() < 0.5, sold=rng.random() < 0.1,
                auctionDate=rng.choice(
                    [(NOW + timedelta(days=days)).isoformat(), "", "not a date",
                     (NOW + timedelta(days=days)).date().isoformat()]
                ),
                imageUrl=rng.choice(["", "https://x.bid.cars/a.jpg", "https://cdn.example/a.jpg"]),
                vin=rng.choice(["", "WBA123"]),
            )
        )
    return out


class QueryMatchesPythonFilterTests(unittest.TestCase):
    """SQL filters must return exactly what filter_lots() returned over the snapshot."""

    def setUp(self):
        patcher = patch("app.data.store.get_settings", return_value=SETTINGS)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.lots = _random_lots(1500)
        self.store = LotStore(":memory:")
        self.store.upsert_many(self.lots)
        live = [l for l in active_lots(self.lots, grace_hours=2) if not l.sold]
        if any(l.source == "bidcars" and l.region == "usa" for l in live):
            live = [l for l in live if not (l.region == "usa" and l.source in {"copart", "iaai"})]
        self.live = live

    def _check(self, **kw):
        f = LotFilters(**kw)
        want = sorted(l.id for l in filter_lots(self.live, f))
        got, total, counts = self.store.query_lots(f, limit=100000)
        self.assertEqual(sorted(l.id for l in got), want, kw)
        self.assertEqual(total, len(want), kw)
        self.assertEqual(sum(counts.values()), len(want), kw)

    def test_every_filter(self):
        cases = [
            {}, {"region": "china"}, {"region": "usa"}, {"q": "mustang"}, {"q": "wba"},
            {"q": "2020"}, {"q": "ТОЙОТА"}, {"make": "bmw"}, {"make": "kia"}, {"make": "škoda"},
            {"make": "тойота"}, {"model": "x5"}, {"model": "КАМРИ"}, {"auctions": ["encar"]},
            {"auctions": ["encar", "copart_uk"]}, {"tab": "buy-now"}, {"tab": "passable"},
            {"tab": "open"}, {"year_from": 2015}, {"year_to": 2010},
            {"year_from": 2010, "year_to": 2012}, {"price_min": 1000}, {"price_max": 1000},
            {"mileage_max": 50000}, {"body": "suv"}, {"body": "rio"}, {"damage": "rear"},
            {"damage": "град"}, {"run": True}, {"buynow": True}, {"eng_min": 1.9},
            {"eng_max": 1.8}, {"eng_min": 1.6, "eng_max": 2.5}, {"fuel": "gasoline"},
            {"fuel": "diesel"}, {"drive": "awd"}, {"trans": "auto"},
            {"region": "korea", "make": "ford", "year_from": 2010, "run": True},
        ]
        for case in cases:
            self._check(**case)

    def test_sort_and_pages(self):
        f = LotFilters(region="korea")
        rows = filter_lots(self.live, f)
        for sort, key in (
            ("date", lambda l: l.auctionDate or ""),
            ("price", lambda l: l.currentBid),
            ("year", lambda l: l.year),
        ):
            for order in ("asc", "desc"):
                got, _, _ = self.store.query_lots(f, sort=sort, order=order, limit=100000)
                self.assertEqual(
                    [key(l) for l in got], sorted(map(key, rows), reverse=order == "desc")
                )
        whole, _, _ = self.store.query_lots(f, limit=100000)
        pages = []
        for offset in range(0, len(whole), 24):
            pages += self.store.query_lots(f, limit=24, offset=offset)[0]
        self.assertEqual([l.id for l in pages], [l.id for l in whole])

    def test_own_photo(self):
        got, _, _ = self.store.query_lots(LotFilters(), limit=100000, own_photo=True)
        want = [l for l in self.live if l.imageUrl and "bid.car" not in l.imageUrl]
        self.assertEqual(sorted(l.id for l in got), sorted(l.id for l in want))

    def test_prune_removes_what_python_calls_ended(self):
        ended = {l.id for l in self.lots} - {l.id for l in active_lots(self.lots, grace_hours=2)}
        with patch.object(self.store, "_queue_photo_cleanup"):
            self.assertEqual(self.store.prune_ended(), len(ended))
        self.assertFalse(ended & self.store.ids())


class WritesTests(unittest.TestCase):
    def test_alias_collapses_into_new_id(self):
        store = LotStore(":memory:")
        store.upsert(_lot("usa-1", source="copart", region="usa", lotNumber="77", slug="old"))
        store.upsert(_lot("usa-copart-1", source="copart", region="usa", lotNumber="77", slug="new"))
        self.assertEqual(store.ids(), {"usa-copart-1"})
        self.assertEqual(len(store), 1)
        self.assertIsNone(store.get_by_slug("old"))
        self.assertEqual(store.export_delta(0, 100)["deleted"], ["usa-1"])

    def test_rescrape_of_unchanged_lot_is_not_a_change(self):
        store = LotStore(":memory:")
        store.upsert(_lot("a"))
        head = store.seq
        self.assertEqual(store.upsert_many([_lot("a")]), (1, 0))
        self.assertEqual(store.seq, head)

    def test_china_date_is_stable_until_it_runs_low(self):
        store = LotStore(":memory:")
        far = (NOW + timedelta(days=13)).isoformat()
        low = (NOW + timedelta(days=3)).isoformat()
        rolled = (NOW + timedelta(days=14)).isoformat()
        china = dict(region="china", source="china_market")
        store.upsert(_lot("c", auctionDate=far, **china))
        head = store.seq
        store.upsert(_lot("c", auctionDate=rolled, **china))
        self.assertEqual(store.seq, head)
        self.assertEqual(store.get_by_id("c").auctionDate, far)
        store.upsert(_lot("d", auctionDate=low, **china))
        store.upsert(_lot("d", auctionDate=rolled, **china))
        self.assertEqual(store.get_by_id("d").auctionDate, rolled)

    def test_failed_transaction_leaves_nothing(self):
        store = LotStore(":memory:")
        with self.assertRaises(RuntimeError):
            with store._tx():
                store._write(_lot("a"))
                raise RuntimeError("boom")
        self.assertEqual(len(store), 0)
        self.assertIsNone(store.get_by_id("a"))

    def test_iteration_survives_writes_and_uses_chunks(self):
        store = LotStore(":memory:")
        store.upsert_many([_lot(f"l{i}") for i in range(4500)])
        seen = 0
        for lot in store.iter_all():
            seen += 1
            if seen == 1:
                store.update_photos(lot.id, ["https://cdn.example/1.jpg"])
        self.assertEqual(seen, 4500)


class DiskTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        self.settings = SimpleNamespace(
            lots_json_path=str(self.dir / "lots.json"),
            scraper_prune_ended=True,
            scraper_auction_grace_hours=2,
        )
        patcher = patch("app.data.store.get_settings", return_value=self.settings)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_lots_json_is_imported_once(self):
        lots = [_lot(f"l{i}").model_dump(exclude_none=True) for i in range(3)]
        lots.append({"id": "broken"})
        (self.dir / "lots.json").write_text(json.dumps({"lots": lots}), encoding="utf-8-sig")
        store = LotStore()
        self.assertEqual(len(store), 3)
        self.assertTrue((self.dir / "lots.db").is_file())
        store.delete("l0")
        again = LotStore()
        self.assertEqual(len(again), 2)
        self.assertEqual(again.catalog_id, store.catalog_id)
        self.assertEqual(again.reload(), 2)

    def test_empty_catalog_does_not_reimport_after_everything_was_deleted(self):
        (self.dir / "lots.json").write_text(
            json.dumps({"lots": [_lot("a").model_dump(exclude_none=True)]}), encoding="utf-8"
        )
        store = LotStore()
        store.delete("a")
        self.assertEqual(len(LotStore()), 0)

    def test_broken_json_starts_empty(self):
        (self.dir / "lots.json").write_text("{", encoding="utf-8")
        self.assertEqual(len(LotStore()), 0)

    def test_reader_threads_see_committed_writes(self):
        import threading

        store = LotStore()
        store.upsert(_lot("a"))
        found = {}
        t = threading.Thread(target=lambda: found.update(lot=store.get_by_id("a")))
        t.start()
        t.join()
        self.assertEqual(found["lot"].id, "a")


class DeltaSyncTests(unittest.TestCase):
    def setUp(self):
        self.source = LotStore(":memory:")
        self.public = LotStore(":memory:")

    def _sync(self, limit=3, from_zero=False):
        state = self.public.sync_state()
        same = state["catalog_id"] == self.source.catalog_id
        cursor = 0 if from_zero or not same else state["cursor"]
        while True:
            batch = self.source.export_delta(cursor, limit)
            if cursor and batch["to"] == cursor and not batch["lots"] and not batch["deleted"]:
                return
            batch["catalog_id"] = self.source.catalog_id
            self.assertTrue(self.public.apply_delta(batch)["ok"])
            cursor = batch["to"]
            if batch["done"]:
                return

    def _ids(self):
        return self.public.ids()

    def test_first_sync_replaces_the_imported_catalog(self):
        self.public.upsert_many([_lot("stale"), _lot("both", currentBid=1)])
        self.source.upsert_many([_lot(f"l{i}") for i in range(10)] + [_lot("both", currentBid=9)])
        self._sync()
        self.assertEqual(self._ids(), {f"l{i}" for i in range(10)} | {"both"})
        self.assertEqual(self.public.get_by_id("both").currentBid, 9)
        self.assertEqual(len(self.public), 11)

    def test_single_batch_full_sync_keeps_what_it_just_wrote(self):
        self.public.upsert_many([_lot("a"), _lot("gone")])
        self.source.upsert(_lot("a", currentBid=5))
        self._sync(limit=100)
        self.assertEqual(self._ids(), {"a"})

    def test_old_catalog_stays_until_last_batch(self):
        self.public.upsert(_lot("stale"))
        self.source.upsert_many([_lot(f"l{i}") for i in range(4)])
        first = self.source.export_delta(0, 2)
        first["catalog_id"] = self.source.catalog_id
        self.public.apply_delta(first)
        self.assertIn("stale", self.public)

    def test_only_changes_travel_after_first_sync(self):
        self.source.upsert_many([_lot(f"l{i}") for i in range(10)])
        self._sync()
        self.source.upsert(_lot("l3", currentBid=7))
        self.source.delete("l4")
        self.source.upsert(_lot("new"))
        cursor = self.public.sync_cursor()
        batch = self.source.export_delta(cursor, 100)
        self.assertEqual(sorted(l["id"] for l in batch["lots"]), ["l3", "new"])
        self.assertEqual(batch["deleted"], ["l4"])
        self._sync()
        self.assertEqual(self.public.get_by_id("l3").currentBid, 7)
        self.assertNotIn("l4", self.public)
        self.assertIn("new", self.public)

    def test_nothing_to_send_changes_nothing(self):
        self.source.upsert(_lot("a"))
        self._sync()
        head = self.public.seq
        self._sync()
        self.assertEqual(self.public.seq, head)

    def test_interrupted_full_sync_resumes_and_still_cleans_up(self):
        self.public.upsert(_lot("stale"))
        self.source.upsert_many([_lot(f"l{i}") for i in range(6)])
        first = self.source.export_delta(0, 2)
        first["catalog_id"] = self.source.catalog_id
        self.public.apply_delta(first)
        self._sync(limit=2)
        self.assertEqual(self._ids(), {f"l{i}" for i in range(6)})

    def test_restarted_full_sync_drops_lots_of_the_interrupted_attempt(self):
        self.source.upsert_many([_lot("keep"), _lot("sold-meanwhile")])
        first = self.source.export_delta(0, 100)
        first.update(catalog_id=self.source.catalog_id, done=False)
        self.public.apply_delta(first)
        self.source.delete("sold-meanwhile")
        self._sync(from_zero=True)
        self.assertEqual(self._ids(), {"keep"})

    def test_batch_from_wrong_position_is_rejected(self):
        self.source.upsert_many([_lot("a"), _lot("b")])
        self._sync()
        result = self.public.apply_delta(
            {"catalog_id": self.source.catalog_id, "from": 999, "to": 1000, "lots": [], "deleted": []}
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["cursor"], self.public.sync_cursor())

    def test_new_scraper_database_triggers_full_sync(self):
        self.source.upsert(_lot("old"))
        self._sync()
        self.source = LotStore(":memory:")
        self.source.upsert(_lot("fresh"))
        self._sync()
        self.assertEqual(self._ids(), {"fresh"})

    def test_relisted_lot_is_not_deleted_by_its_old_tombstone(self):
        self.source.upsert(_lot("a"))
        self._sync()
        self.source.delete("a")
        self.source.upsert(_lot("a", currentBid=3))
        self._sync()
        self.assertEqual(self.public.get_by_id("a").currentBid, 3)

    def test_old_full_push_still_works_and_forces_next_full_sync(self):
        self.public.upsert(_lot("stale"))
        self.assertEqual(self.public.replace_all([_lot("a").model_dump(exclude_none=True)]), 1)
        self.assertEqual(self._ids(), {"a"})
        self.assertEqual(self.public.sync_cursor(), 0)


if __name__ == "__main__":
    unittest.main()
