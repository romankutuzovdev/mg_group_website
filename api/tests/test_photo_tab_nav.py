from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import lot_photos as lp

JPEG = b"\xff\xd8\xff" + bytes(2000)


class _Resp:
    def __init__(self, status, ctype, body=b""):
        self.status = status
        self.headers = {"content-type": ctype}
        self._body = body

    async def body(self):
        return self._body


class _Helper:
    def __init__(self, script):
        self.script = script  # url -> list of responses per attempt
        self.calls: list[str] = []
        self.closed = False

    async def goto(self, url, **kw):
        self.calls.append(url)
        seq = self.script[url]
        return seq.pop(0)

    async def wait_for_timeout(self, ms):
        return None

    async def close(self):
        self.closed = True


class _Ctx:
    def __init__(self, helper):
        self.helper = helper

    async def new_page(self):
        return self.helper


class _Page:
    def __init__(self, helper):
        self.context = _Ctx(helper)


class TabNavigationTests(unittest.TestCase):
    def test_needs_tab_navigation_hosts(self):
        self.assertTrue(lp._needs_tab_navigation("https://pluto.bid.car/1-1/x-1.jpg"))
        self.assertTrue(lp._needs_tab_navigation("https://images.bid.cars/1_x/y-1.jpg"))
        self.assertFalse(lp._needs_tab_navigation("https://cs.copart.com/v1/x.jpg"))
        self.assertFalse(lp._needs_tab_navigation("not a url"))

    def test_downloads_via_helper_tab_and_retries_challenge(self):
        u1 = "https://pluto.bid.car/1-1/car-1.jpg"
        u2 = "https://pluto.bid.car/1-1/car-2.jpg"
        u3 = "https://pluto.bid.car/1-1/car-3.jpg"
        helper = _Helper(
            {
                u1: [_Resp(200, "image/jpeg", JPEG)],
                u2: [_Resp(403, "text/html", b"<html>Just a moment"), _Resp(200, "image/jpeg", JPEG)],
                u3: [_Resp(404, "text/html", b"<html>")],
            }
        )
        with tempfile.TemporaryDirectory() as tmp, patch.object(
            lp, "_compress_image", side_effect=lambda raw, **kw: (raw, ".jpg")
        ):
            folder = Path(tmp)
            saved = asyncio.run(
                lp._archive_via_tab_navigation(
                    _Page(helper), lot_id="usa-bidcars-1-1", folder=folder, pending=[(1, u1), (2, u2), (3, u3)]
                )
            )
            self.assertEqual(sorted(saved), [1, 2])
            self.assertTrue(all(p.startswith("/api/lot-photos/") for p in saved.values()))
            self.assertEqual(len(list(folder.glob("0[12]-*.jpg"))), 4)  # display + thumb each
        self.assertEqual(helper.calls, [u1, u2, u2, u3])
        self.assertTrue(helper.closed)

    def test_no_page_returns_empty(self):
        saved = asyncio.run(
            lp._archive_via_tab_navigation(None, lot_id="x", folder=Path("/tmp"), pending=[(1, "https://pluto.bid.car/a.jpg")])
        )
        self.assertEqual(saved, {})


if __name__ == "__main__":
    unittest.main()
