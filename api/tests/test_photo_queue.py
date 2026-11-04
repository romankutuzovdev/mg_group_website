from __future__ import annotations

import unittest
from unittest.mock import patch

from app.models.lots import AuctionLot
from app.scraper import photo_enricher
from app.scraper.photo_enricher import PhotoEnrichmentAgent


def _lot(lot_id: str, *, bid: float, sold: bool = False) -> AuctionLot:
    return AuctionLot(
        id=lot_id, slug=lot_id, region="usa", source="bidcars", lotNumber=lot_id,
        make="Ford", model="Mustang", year=2020, currentBid=bid, sold=sold,
        lotUrl=f"https://bid.cars/en/lot/{lot_id}",
        imageUrl="https://pluto.bid.car/1/a-1.jpg",
        imageUrls=[f"https://pluto.bid.car/1/a-{i}.jpg" for i in range(1, 6)],
    )


class PhotoQueueTests(unittest.TestCase):
    def test_sold_lots_are_not_queued_even_with_highest_bid(self):
        lots = [_lot("sold", bid=90000, sold=True), _lot("live", bid=500)]
        with patch.object(photo_enricher.lot_store, "all", return_value=lots):
            queue = PhotoEnrichmentAgent()._queue()
        self.assertEqual([lot.id for lot in queue], ["live"])


if __name__ == "__main__":
    unittest.main()


class CoverFirstTests(unittest.IsolatedAsyncioTestCase):
    def test_lot_without_cover_goes_before_full_galleries(self):
        done = _lot("done", bid=90000)
        done.imageUrl = "/api/lot-photos/done/01-a.jpg"
        fresh = _lot("fresh", bid=100)
        with patch.object(photo_enricher.lot_store, "all", return_value=[done, fresh]):
            queue = PhotoEnrichmentAgent()._queue()
        self.assertEqual(queue[0].id, "fresh")

    async def test_cover_archives_one_photo_and_is_tried_once(self):
        agent = PhotoEnrichmentAgent()
        lot = _lot("fresh", bid=100)
        calls = []

        async def fake_archive(lot_id, urls, **kw):
            calls.append(urls)
            return ["/api/lot-photos/fresh/01-a.jpg"]

        with patch("app.services.lot_photos.archive_gallery", side_effect=fake_archive), patch(
            "app.services.r2_photos.promote_gallery_urls",
            side_effect=lambda lot_id, urls, **kw: urls,
        ), patch.object(photo_enricher.lot_store, "update_photos", return_value=lot) as update:
            self.assertEqual(await agent._archive_cover(object(), lot), 1)
        self.assertEqual(calls, [[lot.imageUrl]])
        merged = update.call_args.args[1]
        self.assertEqual(merged[0], "/api/lot-photos/fresh/01-a.jpg")
        self.assertIn("https://pluto.bid.car/1/a-2.jpg", merged)
        self.assertFalse(agent._wants_cover(lot))

    async def test_failed_cover_does_not_block_the_queue(self):
        agent = PhotoEnrichmentAgent()
        lot = _lot("bad", bid=100)

        async def nothing(*a, **k):
            return []

        with patch("app.services.lot_photos.archive_gallery", side_effect=nothing):
            self.assertEqual(await agent._archive_cover(object(), lot), 0)
        self.assertFalse(agent._wants_cover(lot))


class CoverUkTests(unittest.IsolatedAsyncioTestCase):
    def _uk(self):
        lot = _lot("uk-copart-1", bid=100)
        lot.source = "copart_uk"
        lot.region = "uk"
        lot.imageUrl = "https://cs.copart.com/v1/a.jpg"
        return lot

    def test_uk_cover_goes_before_bidcars_galleries(self):
        gallery = _lot("gallery", bid=90000)
        gallery.imageUrl = "/api/lot-photos/gallery/01-a.jpg"
        with patch.object(photo_enricher.lot_store, "all", return_value=[gallery, self._uk()]):
            queue = PhotoEnrichmentAgent()._queue()
        self.assertEqual(queue[0].id, "uk-copart-1")

    async def test_uk_cover_uses_uk_referer(self):
        hints = []

        async def fake_archive(lot_id, urls, *, referer_hint, page):
            hints.append(referer_hint)
            return []

        with patch("app.services.lot_photos.archive_gallery", side_effect=fake_archive):
            await PhotoEnrichmentAgent()._archive_cover(object(), self._uk())
        self.assertEqual(hints, ["uk"])
