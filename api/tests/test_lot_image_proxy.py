from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.routers import lot_image


class ClientArgsTests(unittest.TestCase):
    def _args(self, host, **env):
        settings = SimpleNamespace(lot_image_proxy_url="", ai_proxy_url="", scraper_proxy_url="")
        for k, v in env.items():
            setattr(settings, k, v)
        with patch.object(lot_image, "get_settings", return_value=settings):
            return lot_image._client_args(host)

    def test_copart_goes_through_proxy(self):
        self.assertEqual(self._args("cs.copart.com", ai_proxy_url="http://p:1")["proxy"], "http://p:1")

    def test_dedicated_proxy_wins(self):
        args = self._args("cs.copart.com", ai_proxy_url="http://p:1", lot_image_proxy_url="http://q:2")
        self.assertEqual(args["proxy"], "http://q:2")

    def test_other_hosts_and_no_proxy_stay_direct(self):
        self.assertNotIn("proxy", self._args("ci.encar.com", ai_proxy_url="http://p:1"))
        self.assertNotIn("proxy", self._args("cs.copart.com"))

    def test_windows_uses_its_scraper_proxy(self):
        self.assertEqual(self._args("cs.copart.com", scraper_proxy_url="http://w:3")["proxy"], "http://w:3")


class WindowsForwardTests(unittest.TestCase):
    URL = "https://cs.copart.com/v1/a_ful.jpg"

    def _get(self, *, forwarded, proxy=False):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.include_router(lot_image.router)

        async def fake(url):
            self.asked = url
            return forwarded

        with patch.object(lot_image, "should_proxy_lot_lookup", return_value=True), patch.object(
            lot_image, "_fetch_from_windows", side_effect=fake
        ), patch.object(lot_image, "_read_cache", return_value=None), patch.object(
            lot_image, "_write_cache"
        ) as write:
            res = TestClient(app).get("/api/lot-image", params={"u": self.URL})
        return res, write

    def test_vps_returns_windows_bytes_without_writing_to_disk(self):
        data = b"\xff\xd8\xff" + bytes(2000)
        res, write = self._get(forwarded=(data, "image/jpeg"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers["X-Lot-Image-Cache"], "WINDOWS")
        self.assertEqual(res.content, data)
        self.assertEqual(self.asked, self.URL)
        write.assert_not_called()

    def test_only_copart_is_forwarded(self):
        with patch.object(lot_image, "should_proxy_lot_lookup", return_value=True):
            self.assertTrue(lot_image._windows_serves("cs.copart.com"))
            self.assertFalse(lot_image._windows_serves("ci.encar.com"))


class BidCarsHostTests(unittest.TestCase):
    URL = "https://pluto.bid.car/1-60657476/2023-KIA-Forte-1.jpg?ver=1840"

    def test_new_bid_car_cdn_is_allowed(self):
        self.assertTrue(lot_image._ALLOWED.search("pluto.bid.car"))
        self.assertTrue(lot_image._ALLOWED.search("images.bid.cars"))
        self.assertFalse(lot_image._ALLOWED.search("evilbid.car.example.com"))

    def test_vps_forwards_bidcars_to_windows_chrome(self):
        with patch.object(lot_image, "should_proxy_lot_lookup", return_value=True):
            self.assertTrue(lot_image._windows_serves("pluto.bid.car"))
            self.assertTrue(lot_image._windows_serves("images.bid.cars"))
        with patch.object(lot_image, "should_proxy_lot_lookup", return_value=False):
            self.assertFalse(lot_image._windows_serves("pluto.bid.car"))

    def test_windows_falls_back_to_chrome_tab_when_cdn_refuses(self):
        import asyncio

        data = b"\xff\xd8\xff" + bytes(2000)

        class Refused:
            status_code = 403
            headers = {"content-type": "text/html"}
            content = b"blocked"

        class Client:
            def __init__(self, **_):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def get(self, *a, **k):
                return Refused()

        waits = []

        async def chrome(url, *, wait=False):
            waits.append(wait)
            return data, "image/jpeg"

        with patch.object(lot_image, "should_proxy_lot_lookup", return_value=False), patch.object(
            lot_image.httpx, "AsyncClient", Client
        ), patch.object(lot_image, "_fetch_bidcars_via_chrome", side_effect=chrome), patch.object(
            lot_image, "_read_cache", return_value=None
        ), patch.object(lot_image, "_write_cache"), patch.object(
            lot_image, "get_settings",
            return_value=SimpleNamespace(lot_image_proxy_url="", ai_proxy_url="", scraper_proxy_url=""),
        ):
            got = asyncio.run(lot_image.fetch_lot_image(self.URL, wait_for_chrome=True))
        self.assertEqual(got, (data, "image/jpeg", "CHROME"))
        self.assertEqual(waits, [True])
