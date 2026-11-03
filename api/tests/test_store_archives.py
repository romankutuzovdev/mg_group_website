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
