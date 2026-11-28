import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from xml.etree import ElementTree

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.data.store import LotStore
from app.models.lots import AuctionLot
from app.routers import sitemaps


def lot(lot_id, **fields):
    data = dict(id=lot_id, slug=lot_id, region="korea", source="encar", lotNumber=lot_id,
                make="BMW", model="X5", year=2020, imageUrl="https://ci.encar.com/car.jpg")
    return AuctionLot(**(data | fields))


class SitemapsTests(unittest.TestCase):
    def setUp(self):
        tmp = self.enterContext(tempfile.TemporaryDirectory())
        self.file = Path(tmp, "sitemap.xml")
        self.file.write_text('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                             '<url><loc>https://mg-group.by/</loc></url></urlset>')
        settings = SimpleNamespace(web_root=tmp, lots_json_path="unused.json",
                                   scraper_prune_ended=False, scraper_auction_grace_hours=3)
        self.enterContext(patch("app.data.store.get_settings", return_value=settings))
        self.enterContext(patch.object(sitemaps, "get_settings", return_value=settings))
        self.store = LotStore(":memory:")
        self.enterContext(patch.object(sitemaps, "lot_store", self.store))
        self.enterContext(patch.object(sitemaps, "SHARD_SIZE", 2))
        app = FastAPI()
        app.include_router(sitemaps.router)
        app.include_router(sitemaps.inventory_router, prefix="/api/v1")
        self.client = TestClient(app)

    def locations(self, route):
        response = self.client.get(route)
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/xml", response.headers["content-type"])
        return [n.text for n in ElementTree.fromstring(response.content).iterfind(".//{*}loc")]

    def test_current_eligible_lots_and_stable_shards(self):
        self.store.upsert_many([
            lot("one", slug="лот&1"), lot("sold", sold=True),
            lot("demo-seed"), lot("ended", auctionDate="2024-01-01"),
            lot("five", imageUrl="", imageUrls=["/api/lot-photos/five/1.jpg"]), lot("no-photo", imageUrl=""),
            lot("placeholder", imageUrl="/auctions/lots/_placeholder.svg"), lot("bad", slug="../bad"),
        ])
        site = sitemaps.SITE_ORIGIN
        self.assertEqual(self.locations("/sitemap.xml"),
                         [site + "/sitemap-pages.xml", site + "/sitemap-auctions-1.xml",
                          site + "/sitemap-auctions-3.xml"])
        self.assertEqual(self.locations("/sitemap-pages.xml"), [site + "/"])
        self.assertEqual(self.locations("/sitemap-auctions-1.xml"),
                         [site + "/auctions/%D0%BB%D0%BE%D1%82%261/"])
        self.store.delete("one")
        self.store.upsert(lot("next"))
        self.assertEqual(self.locations("/sitemap.xml"),
                         [site + "/sitemap-pages.xml", site + "/sitemap-auctions-3.xml",
                          site + "/sitemap-auctions-5.xml"])
        self.assertEqual(self.locations("/sitemap-auctions-3.xml"), [site + "/auctions/five/"])
        self.assertEqual(self.client.get("/sitemap-auctions-1.xml").status_code, 404)
        self.assertEqual(self.client.get("/sitemap-auctions-9999999999999999999999.xml").status_code, 404)

    def test_duplicate_slug_and_bidcars_catalog_visibility(self):
        self.store.upsert_many([
            lot("first", slug="dupe"), lot("other"), lot("newer", slug="dupe"),
            lot("hidden", region="usa", source="copart"),
            lot("bid", region="usa", source="bidcars", auctionDate="2024-01-01"),
        ])
        urls = [url for part in self.locations("/sitemap.xml")[1:]
                for url in self.locations(part.removeprefix(sitemaps.SITE_ORIGIN))]
        expected = [sitemaps.SITE_ORIGIN + f"/auctions/{slug}/" for slug in ("other", "dupe", "bid")]
        self.assertEqual(urls, expected)

    def test_static_fallback_when_catalog_unavailable(self):
        with patch.object(self.store, "sitemap_candidates", side_effect=sqlite3.OperationalError):
            with self.assertLogs(sitemaps.logger, level="ERROR"):
                self.assertEqual(self.locations("/sitemap.xml"), [sitemaps.SITE_ORIGIN + "/"])
            self.assertEqual(self.client.get("/sitemap-auctions-1.xml").status_code, 503)
        self.file.unlink()
        self.assertEqual(self.client.get("/sitemap.xml").status_code, 503)
        self.store.upsert(lot("remote"))
        self.assertEqual(self.locations("/api/v1/sitemap.xml"), [
            sitemaps.SITE_ORIGIN + "/sitemap-pages.xml", sitemaps.SITE_ORIGIN + "/sitemap-auctions-1.xml",
        ])
        self.assertEqual(self.locations("/api/v1/sitemap-auctions-1.xml"), [
            sitemaps.SITE_ORIGIN + "/auctions/remote/",
        ])
