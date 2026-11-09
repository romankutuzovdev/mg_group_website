from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.models.cabinet import UserOut
from app.routers import cabinet
from app.services.auth_deps import require_admin_or_key

JPEG = b"\xff\xd8\xff" + bytes(3000)
STAFF = UserOut(id=7, telegram_id=7, username="m", first_name="M", last_name="", is_admin=True, created_at="")


def _client():
    app = FastAPI()
    app.include_router(cabinet.router, prefix="/api/v1")
    app.dependency_overrides[require_admin_or_key] = lambda: STAFF
    return TestClient(app)


class ImportFromUrlTests(unittest.TestCase):
    def _post(self, body, *, fetched=None, error=None, deal=True):
        store = MagicMock()
        store.get_deal.return_value = object() if deal else None
        store.add_media.side_effect = lambda **kw: {
            "id": 1, "deal_id": kw["deal_id"], "stage_key": kw["stage_key"], "kind": "photo",
            "url": "/api/v1/media/1", "filename": kw["filename"], "caption": kw["caption"],
            "created_at": "now",
        }
        self.store = store

        async def fake_fetch(url, *, wait_for_chrome=False):
            self.fetched = (url, wait_for_chrome)
            if error:
                raise error
            return fetched, "image/webp", "MISS"

        with patch.object(cabinet, "cabinet_store", store), patch(
            "app.routers.lot_image.fetch_lot_image", side_effect=fake_fetch
        ):
            return _client().post("/api/v1/admin/deals/5/media/from-url", json=body)

    def test_server_downloads_and_stores_photo(self):
        res = self._post({"url": "https://pluto.bid.car/1/a.jpg", "index": 3}, fetched=JPEG)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(self.fetched, ("https://pluto.bid.car/1/a.jpg", True))
        kw = self.store.add_media.call_args.kwargs
        self.assertEqual(kw["content"], JPEG)
        self.assertEqual(kw["filename"], "auction-3.webp")
        self.assertEqual(kw["stage_key"], "auction")
        self.assertEqual(kw["kind"], "photo")

    def test_proxied_url_is_unwrapped(self):
        self._post({"url": "/api/lot-image?u=https%3A%2F%2Fcs.copart.com%2Fx_ful.jpg"}, fetched=JPEG)
        self.assertEqual(self.fetched[0], "https://cs.copart.com/x_ful.jpg")

    def test_cdn_refusal_is_reported_and_nothing_stored(self):
        res = self._post({"url": "https://pluto.bid.car/1/a.jpg"}, error=HTTPException(502, "Upstream 403"))
        self.assertEqual(res.status_code, 502)
        self.store.add_media.assert_not_called()

    def test_unknown_deal(self):
        res = self._post({"url": "https://pluto.bid.car/1/a.jpg"}, fetched=JPEG, deal=False)
        self.assertEqual(res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
