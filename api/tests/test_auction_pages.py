from __future__ import annotations

import json
import re
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.data.store import LotStore
from app.models.lots import AuctionLot
from app.routers import auction_pages, lots
from app.services.lot_seo import lot_preview


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_script = False
        self.words = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.in_script = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False

    def handle_data(self, data):
        if not self.in_script:
            self.words.append(data)


class PublicAuctionPageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = LotStore(":memory:")
        self.lot = AuctionLot(
            id="record-12", slug="ford-mustang-12", region="usa", source="bidcars",
            lotNumber="N-553377", make="Ford", model='Mustang <GT> "R"', year=2022,
            currentBid=12500.25, currency="USD",
        )
        self.store.upsert(self.lot)
        self.enterContext(patch("app.routers.lots.lot_store", self.store))
        self.enterContext(patch("app.routers.auction_pages._web_root", return_value=self.root))
        app = FastAPI()
        app.include_router(auction_pages.router)
        app.include_router(lots.router, prefix="/api/v1")
        self.client = TestClient(app)
        self.url = "/auctions/ford-mustang-12/"

    def test_active_body_and_metadata_without_javascript(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertIn('rel="canonical" href="https://mg-group.by' + self.url, response.text)
        parser = VisibleText()
        parser.feed(response.text)
        visible = " ".join(parser.words)
        for needle in ('2022 Ford Mustang <GT> "R"', "N-553377", "12 500,25 USD", "В каталоге"):
            self.assertIn(needle, visible)
        self.assertEqual(self.client.head(self.url).status_code, 200)

    def test_stale_export_sold_missing_and_ended_have_http_404(self):
        for slug in ("missing", "sold", "ended"):
            path = self.root / "auctions" / slug / "index.html"
            path.parent.mkdir(parents=True)
            path.write_text("Historic HTML")
        for slug, update in (("sold", {"sold": True}), ("ended", {"auctionDate": "2020-01-01", "source": "copart_uk"})):
            self.store.upsert(self.lot.model_copy(update={"slug": slug, "id": slug, "lotNumber": slug, **update}))
        for slug in ("missing", "sold", "ended", "__live__"):
            self.assertEqual(self.client.get(f"/api/v1/lots/{slug}/page").status_code, 404)
            for suffix in ("", "/", "/index.html"):
                path = f"/auctions/{slug}{suffix}"
                self.assertEqual(self.client.get(path).status_code, 404)
                self.assertEqual(self.client.head(path).status_code, 404)
        self.assertEqual(self.client.get("/api/v1/lots/sold").status_code, 200)

    def test_alias_redirect_preserves_query(self):
        for path in ("/auctions/record-12/", self.url.rstrip("/"), self.url + "index.html"):
            response = self.client.get(path + "?mode=kit", follow_redirects=False)
            self.assertEqual(response.status_code, 308)
            self.assertEqual(response.headers["Location"], self.url + "?mode=kit")

    def test_shell_data_matches_first_paint_and_escapes_script_text(self):
        lot = self.lot.model_copy(update={"model": "Mustang </script><em> & __MG_LOT_title__"})
        self.store.upsert(lot)
        path = self.root / "auctions" / "__live__" / "index.html"
        path.parent.mkdir(parents=True)
        path.write_text(
            '<head><title>__MG_LOT_title__</title></head><body><header>Шапка</header>'
            '<h1>__MG_LOT_name__</h1><footer>Контакты</footer>'
            '<script id="__NEXT_DATA__" type="application/json">'
            '{"props":{"pageProps":{"auctionPage":null}}}</script></body>', encoding="utf-8",
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertIn("<header>Шапка</header>", response.text)
        self.assertIn("<footer>Контакты</footer>", response.text)
        self.assertIn("&lt;/script&gt;", response.text)
        self.assertEqual(response.text.count("</script>"), 1)
        embedded = re.search(r'application/json">(.*?)</script>', response.text).group(1)
        page = json.loads(embedded)["props"]["pageProps"]["auctionPage"]
        self.assertEqual(page["lot"]["model"], lot.model)
        self.assertEqual(page["preview"], self.client.get("/api/v1/lots/ford-mustang-12/page").json()["preview"])

    def test_unknown_bid_is_not_a_zero_price(self):
        lot = self.lot.model_copy(update={"currentBid": 0})
        self.assertEqual(lot_preview(lot)["price"], "Уточняется")
        buy_now = lot.model_copy(update={"buyNowPrice": 3500, "currency": "GBP"})
        self.assertEqual(lot_preview(buy_now)["price"], "3 500 GBP")
        self.assertEqual(lot_preview(buy_now)["priceLabel"], "Цена выкупа")
