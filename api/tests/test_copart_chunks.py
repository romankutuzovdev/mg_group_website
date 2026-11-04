from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.scraper import copart_common


class _Tab:
    async def goto(self, *a, **k):
        return None

    async def wait_for_timeout(self, ms):
        return None

    async def evaluate(self, script, arg=None):
        rows = [{"ln": str(i), "lotNumberStr": str(i), "dynamicLotDetails": {}} for i in range(250)]
        return {"ok": True, "json": {"returnCode": 1, "data": {"results": {"content": rows, "totalElements": 250}}}}


class ChunkTests(unittest.TestCase):
    def test_chunks_are_delivered_before_a_later_failure(self):
        got: list[int] = []
        calls = {"n": 0}

        async def galleries(tab, rows, *, origin):
            calls["n"] += 1
            if calls["n"] == 3:
                raise asyncio.TimeoutError
            for r in rows:
                r["images"] = ["a", "b"]

        async def run():
            with patch.object(copart_common, "_accept_cookies", AsyncMock()), patch.object(
                copart_common, "_settle_page", AsyncMock(return_value="ok")
            ), patch.object(copart_common, "_attach_lot_details", AsyncMock()), patch.object(
                copart_common, "_attach_galleries", side_effect=galleries
            ):
                await copart_common.scrape_copart_inventory(
                    _Tab(), origin="https://x", warm_url="https://x", max_pages=1,
                    page_size=250, timeout_ms=1000, on_chunk=lambda rows: got.append(len(rows)),
                )

        with self.assertRaises(asyncio.TimeoutError):
            asyncio.run(run())
        self.assertEqual(got, [100, 100])
