import asyncio
import unittest
from unittest import mock

from app.models.lots import AuctionLot
from app.services import china_gallery


def _lot(images: list[str], *, region: str = "china") -> AuctionLot:
    return AuctionLot(
        id="china-1",
        slug="china-market-2023-nissan-x-trail-1",
        region=region,
        source="china_market" if region == "china" else "bidcars",
        lotNumber="1",
        vin="*****************",
        make="Nissan",
        model="X-Trail",
        year=2023,
        titleType="clean",
        primaryDamage="—",
        odometer=20100,
        odometerUnit="km",
        currentBid=16630,
        currency="USD",
        location="China",
        auctionDate="2026-12-01T00:00:00+00:00",
        imageUrl=images[0] if images else "",
        imageUrls=images,
        exteriorColor="—",
        hasKeys=True,
        runsDrives=True,
        lotUrl="https://global.autohome.com/en/detail/1",
    )


GALLERY = [f"https://x.autoimg.cn/p{i}.jpg.webp" for i in range(5)]


class EnsureChinaGalleryTests(unittest.TestCase):
    def setUp(self):
        china_gallery._failed.clear()
        china_gallery._inflight.clear()

    def run_ensure(self, lot):
        return asyncio.run(china_gallery.ensure_china_gallery(lot))

    def test_lot_with_gallery_is_not_fetched(self):
        fetch = mock.AsyncMock()
        with mock.patch.object(china_gallery, "_fetch", fetch):
            out = self.run_ensure(_lot(GALLERY[:3]))
        fetch.assert_not_called()
        self.assertEqual(out["imageUrls"], GALLERY[:3])
        self.assertFalse(out["fetched"])

    def test_other_regions_are_not_fetched(self):
        fetch = mock.AsyncMock()
        with mock.patch.object(china_gallery, "_fetch", fetch):
            self.run_ensure(_lot(GALLERY[:1], region="usa"))
        fetch.assert_not_called()

    def test_single_photo_lot_gets_gallery(self):
        fetch = mock.AsyncMock(return_value=GALLERY)
        with mock.patch.object(china_gallery, "_fetch", fetch):
            out = self.run_ensure(_lot(GALLERY[:1]))
        self.assertEqual(out["imageUrls"], GALLERY)
        self.assertTrue(out["fetched"])

    def test_failure_is_not_retried_right_away(self):
        fetch = mock.AsyncMock(return_value=[])
        with mock.patch.object(china_gallery, "_fetch", fetch):
            first = self.run_ensure(_lot(GALLERY[:1]))
            second = self.run_ensure(_lot(GALLERY[:1]))
        self.assertEqual(fetch.await_count, 1)
        self.assertEqual(first["imageUrls"], GALLERY[:1])
        self.assertEqual(second["error"], "recently_failed")

    def test_windows_keeps_cdn_cover_first(self):
        cdn = "https://pub-x.r2.dev/lots/china-1/0.jpg"
        lot = _lot([cdn])
        stored = {}

        async def open_tab(scrape, timeout_sec):
            return list(GALLERY)

        def update_photos(lot_id, urls):
            stored["urls"] = urls
            return _lot(urls)

        worker = mock.Mock(open_lot_on_lookup_tab=open_tab)
        with mock.patch("app.scraper.worker.scraper_worker", worker), mock.patch.object(
            china_gallery.lot_store, "update_photos", update_photos
        ), mock.patch(
            "app.services.lot_photos.is_our_photo", lambda u: u == cdn
        ):
            urls = asyncio.run(china_gallery._fetch_on_windows(lot))
        # che168 original of the cover (GALLERY[0]) is replaced by our copy.
        self.assertEqual(stored["urls"], [cdn] + GALLERY[1:])
        self.assertEqual(urls, [cdn] + GALLERY[1:])


if __name__ == "__main__":
    unittest.main()
