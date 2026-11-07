from __future__ import annotations

import unittest
from urllib.parse import parse_qs, urlparse

from app.scraper import autohome


def _api(
    catalog: dict[int, list[int]],
    *,
    fail: set[tuple[int, int]] = frozenset(),
    fail_once: bool = False,
    size: int = 2,
):
    calls: list[tuple[int, int]] = []
    fail = set(fail)

    async def fetch(url: str) -> dict:
        if "/brand" in url:
            return {"result": {"brands": [{"brand": [{"bid": b} for b in catalog]}]}}
        qs = parse_qs(urlparse(url).query)
        brand, page = int(qs["brandid"][0]), int(qs["pageindex"][0])
        calls.append((brand, page))
        if (brand, page) in fail:
            if fail_once:
                fail.discard((brand, page))
            raise autohome.AutohomeBlocked("autohome_http_503")
        cars = catalog[brand]
        rows = [{"infoid": i} for i in cars[(page - 1) * size : page * size]]
        return {
            "result": {
                "carlist": rows,
                "totalcount": len(cars),
                "pagecount": -(-len(cars) // size),
            }
        }

    return fetch, calls


class WalkTests(unittest.IsolatedAsyncioTestCase):
    async def _walk(self, fetch, **kw):
        got: list[str] = []
        total = await autohome.walk_catalog(
            fetch, lambda rows: got.extend(r["id"] for r in rows), page_size=2, delay=0, **kw
        )
        return total, got

    async def test_every_brand_and_page(self):
        fetch, _ = _api({1: [10, 11, 12], 2: [20], 3: []})
        total, got = await self._walk(fetch)
        self.assertEqual(total, 4)
        self.assertEqual(got, ["10", "11", "12", "20"])

    async def test_car_listed_under_two_brands_counts_once(self):
        fetch, _ = _api({1: [10], 2: [10, 20]})
        total, got = await self._walk(fetch)
        self.assertEqual((total, got), (2, ["10", "20"]))

    async def test_rows_reach_the_mapper_shape(self):
        fetch, _ = _api({1: [10]})
        rows: list[dict] = []
        await autohome.walk_catalog(fetch, rows.extend, page_size=2, delay=0)
        self.assertEqual(rows[0]["lotNumber"], "10")
        self.assertEqual(rows[0]["lotUrl"], "https://global.autohome.com/en/detail/10")

    async def test_stops_at_the_reliable_window(self):
        fetch, calls = _api({1: list(range(100))})
        original = autohome.WINDOW_ROWS
        autohome.WINDOW_ROWS = 6
        self.addCleanup(setattr, autohome, "WINDOW_ROWS", original)
        await self._walk(fetch)
        self.assertEqual(calls, [(1, 1), (1, 2), (1, 3)])

    async def test_failed_page_is_retried_and_brand_finishes(self):
        fetch, calls = _api({1: [10, 11, 12, 13, 14], 2: [20]}, fail={(1, 2)}, fail_once=True)
        _, got = await self._walk(fetch)
        self.assertEqual(got, ["10", "11", "12", "13", "14", "20"])
        self.assertEqual(calls.count((1, 2)), 2)

    async def test_repeated_failures_stop_the_walk(self):
        catalog = {b: [b] for b in range(1, 10)}
        fetch, calls = _api(catalog, fail={(b, 1) for b in catalog})
        await self._walk(fetch)
        self.assertEqual(len(calls), autohome.MAX_FAILED_REQUESTS)

    async def test_no_brands_is_blocked(self):
        fetch, _ = _api({})
        with self.assertRaises(autohome.AutohomeBlocked):
            await self._walk(fetch)

    async def test_max_pages_caps_requests(self):
        fetch, calls = _api({1: list(range(10)), 2: [99]})
        await self._walk(fetch, max_pages=2)
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
