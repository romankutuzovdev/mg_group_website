from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from app.services import scraper_proxy


def _settings(**overrides):
    base = dict(
        app_role="public",
        scraper_api_url="",
        scraper_api_key="",
        scraper_api_timeout_seconds=30.0,
        lots_source_url="",
        cabinet_source_url="",
        lots_source_api_key="",
        ingest_api_key="",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class ScraperApiBaseTests(unittest.TestCase):
    def test_explicit_url_wins(self):
        with patch.object(
            scraper_proxy,
            "get_settings",
            return_value=_settings(scraper_api_url="http://91.149.133.54/"),
        ):
            self.assertEqual(scraper_proxy.scraper_api_base(), "http://91.149.133.54")

    def test_derived_from_lots_source_url(self):
        with patch.object(
            scraper_proxy,
            "get_settings",
            return_value=_settings(
                lots_source_url="http://91.149.133.54/api/v1/internal/lots-catalog"
            ),
        ):
            self.assertEqual(scraper_proxy.scraper_api_base(), "http://91.149.133.54")

    def test_only_public_role_proxies(self):
        with patch.object(
            scraper_proxy,
            "get_settings",
            return_value=_settings(app_role="scraper", scraper_api_url="http://w"),
        ):
            self.assertFalse(scraper_proxy.should_proxy_lot_lookup())
        with patch.object(
            scraper_proxy,
            "get_settings",
            return_value=_settings(app_role="public", scraper_api_url="http://w"),
        ):
            self.assertTrue(scraper_proxy.should_proxy_lot_lookup())
        with patch.object(
            scraper_proxy, "get_settings", return_value=_settings(app_role="public")
        ):
            self.assertFalse(scraper_proxy.should_proxy_lot_lookup())


class ProxyLotFromUrlTests(unittest.TestCase):
    def _run(self, handler, **overrides):
        settings = _settings(scraper_api_url="http://windows.test", **overrides)
        transport = httpx.MockTransport(handler)
        with patch.object(scraper_proxy, "get_settings", return_value=settings):
            return asyncio.run(
                scraper_proxy.proxy_lot_from_url(
                    "https://bid.cars/en/lot/0-1/x", transport=transport
                )
            )

    def test_forwards_body_and_key_and_returns_payload(self):
        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["key"] = request.headers.get("x-api-key")
            seen["body"] = json.loads(request.content)
            return httpx.Response(
                200, json={"ok": True, "bid": 1500, "via": "lot_lookup_tab"}
            )

        out = self._run(handler, ingest_api_key="secret")
        self.assertEqual(seen["url"], "http://windows.test/api/v1/pricing/lot-from-url")
        self.assertEqual(seen["key"], "secret")
        self.assertEqual(seen["body"], {"url": "https://bid.cars/en/lot/0-1/x"})
        self.assertTrue(out["ok"])
        self.assertEqual(out["bid"], 1500)
        self.assertEqual(out["via"], "lot_lookup_tab")
        self.assertTrue(out["proxied"])

    def test_http_error_raises_runtime_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(502, text="bad gateway")

        with self.assertRaises(RuntimeError) as ctx:
            self._run(handler)
        self.assertIn("scraper_http_502", str(ctx.exception))

    def test_network_error_raises_runtime_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom", request=request)

        with self.assertRaises(RuntimeError) as ctx:
            self._run(handler)
        self.assertIn("scraper_unreachable:ConnectError", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
