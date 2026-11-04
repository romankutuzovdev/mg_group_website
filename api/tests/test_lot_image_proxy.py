from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.routers import lot_image


class ClientArgsTests(unittest.TestCase):
    def _args(self, host, **env):
        settings = SimpleNamespace(lot_image_proxy_url="", ai_proxy_url="", **{})
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
