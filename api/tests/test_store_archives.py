from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.data.store import LotStore
from app.models.lots import AuctionLot


class SoldArchiveTests(unittest.TestCase):
    def test_sold_lot_keeps_remote_cover_and_releases_r2_gallery(self):
        with tempfile.TemporaryDirectory() as tmp, patch(
            "app.data.store.get_settings",
            return_value=SimpleNamespace(lots_json_path=str(Path(tmp) / "missing.json")),
        ):
            store = LotStore()

        lot = AuctionLot(
            id="sold-1",
            slug="sold-1",
            region="usa",
            source="bidcars",
            lotNumber="1",
            make="Ford",
            model="Mustang",
            year=2020,
            sold=True,
            imageUrl="https://img.example/lots/sold-1/01.jpg",
            imageUrls=[
                "https://img.example/lots/sold-1/01.jpg",
                "https://images.bid.cars/source-cover.jpg",
            ],
        )
        store.upsert(lot)

        with (
            patch("app.data.store._is_our_archived_url", side_effect=lambda u: "img.example/lots/" in u),
            patch("app.services.lot_photos.delete_lot_photos") as delete,
        ):
            released = store.release_sold_photo_archives()

        updated = store.get_by_id("sold-1")
        self.assertEqual(released, 1)
        self.assertIsNotNone(updated)
        self.assertEqual(updated.imageUrl, "https://images.bid.cars/source-cover.jpg")
        self.assertEqual(updated.imageUrls, ["https://images.bid.cars/source-cover.jpg"])
        delete.assert_called_once_with("sold-1")


if __name__ == "__main__":
    unittest.main()


class PersistLockTests(unittest.TestCase):
    def test_len_does_not_wait_for_catalog_lock(self):
        import threading

        with tempfile.TemporaryDirectory() as tmp, patch(
            "app.data.store.get_settings",
            return_value=SimpleNamespace(lots_json_path=str(Path(tmp) / "lots.json")),
        ):
            store = LotStore()
            result = {}
            with store._lock:
                t = threading.Thread(target=lambda: result.update(n=len(store)))
                t.start()
                t.join(timeout=1)
            self.assertEqual(result.get("n"), 0)
            self.assertEqual(store.persist(), 0)
            self.assertTrue((Path(tmp) / "lots.json").is_file())


class PruneBackgroundCleanupTests(unittest.TestCase):
    def _store(self, tmp):
        settings = SimpleNamespace(
            lots_json_path=str(Path(tmp) / "lots.json"),
            scraper_prune_ended=True,
            scraper_auction_grace_hours=0,
        )
        patcher = patch("app.data.store.get_settings", return_value=settings)
        patcher.start()
        self.addCleanup(patcher.stop)
        return LotStore()

    def _lot(self, lot_id, when):
        return AuctionLot(
            id=lot_id, slug=lot_id, region="korea", source="encar", lotNumber=lot_id,
            make="Ford", model="Mustang", year=2020, auctionDate=when,
        )

    def test_prune_returns_before_slow_photo_delete_finishes(self):
        import threading
        import time

        release = threading.Event()
        deleted = []

        def slow_delete(lot_id):
            release.wait(5)
            deleted.append(lot_id)

        with tempfile.TemporaryDirectory() as tmp:
            store = self._store(tmp)
            store.upsert_many([self._lot("old", "2020-01-01T00:00:00+00:00")])
            with patch("app.services.lot_photos.delete_lot_photos", side_effect=slow_delete), patch(
                "app.services.lot_photos.sweep_orphan_photos", return_value=0
            ):
                started = time.perf_counter()
                self.assertEqual(store.prune_ended(), 1)
                self.assertLess(time.perf_counter() - started, 1.0)
                self.assertEqual(deleted, [])
                self.assertEqual(len(store), 0)
                release.set()
                store._photo_cleanup.join()
            self.assertEqual(deleted, ["old"])

    def test_relisted_lot_keeps_photos(self):
        deleted = []
        with tempfile.TemporaryDirectory() as tmp:
            store = self._store(tmp)
            lot = self._lot("back", "2020-01-01T00:00:00+00:00")
            store._by_id["back"] = lot
            with patch("app.services.lot_photos.delete_lot_photos", side_effect=deleted.append), patch(
                "app.services.lot_photos.sweep_orphan_photos", return_value=0
            ):
                store._queue_photo_cleanup(["back"])
                store._photo_cleanup.join()
            self.assertEqual(deleted, [])
