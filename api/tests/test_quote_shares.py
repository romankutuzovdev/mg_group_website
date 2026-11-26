import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.cabinet import UserOut
from app.routers import pricing


class QuoteSharesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "cabinet.db"
        self.settings = patch("app.config.get_settings")
        # The share store reads settings lazily, so no production DB is opened.
        self.mock_settings = self.settings.start()
        self.mock_settings.return_value.cabinet_db_path = str(self.db)
        self.addCleanup(self.settings.stop)
        app = FastAPI()
        app.include_router(pricing.router, prefix="/api/v1")
        self.actor = UserOut(
            id=7, telegram_id=123456, first_name="Private Name", username="private_login",
            phone="375291234567", created_at="2026-01-01",
        )
        app.dependency_overrides[pricing.get_current_user] = lambda: self.actor
        self.app = app
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.body = {
            "kind": "restoration", "title": "2020 Toyota Camry",
            "lot_url": "https://bid.cars/en/lot/1-123", "location": "Houston",
            "bid": 8000, "currency": "USD", "total_usd": 12500,
            "summary": "До Минска, без растаможки",
            "image_url": "https://example.com/car.jpg",
            "image_urls": ["https://example.com/car.jpg"],
            "breakdown": [
                {"label": "Ставка", "amount": 8000, "currency": "USD"},
                {"label": "Сборы и доставка", "amount": 4500, "currency": "USD"},
            ],
        }

    def create(self, body=None):
        response = self.client.post("/api/v1/pricing/shared-quotes", json=body or self.body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_authenticated_client_creates_quote_with_unpredictable_token(self):
        first = self.create()
        second = self.create()
        self.assertRegex(first["id"], r"^[A-Za-z0-9_-]{32}$")
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(first["quote"], self.body)
        self.assertTrue(first["created_at"])

    def test_public_view_requires_no_login_and_exposes_only_the_quote(self):
        shared = self.create()
        self.app.dependency_overrides.clear()
        response = self.client.get(f"/api/v1/pricing/shared-quotes/{shared['id']}")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), shared)
        encoded = json.dumps(response.json())
        for private in ("Private Name", "private_login", "375291234567", "telegram_id", "user_id"):
            self.assertNotIn(private, encoded)

    def test_creation_requires_login(self):
        self.app.dependency_overrides.clear()
        response = self.client.post("/api/v1/pricing/shared-quotes", json=self.body)
        self.assertEqual(response.status_code, 401)

    def test_shared_result_does_not_change_when_new_calculation_is_shared(self):
        first = self.create()
        self.body["bid"] = 9000
        self.body["total_usd"] = 14000
        self.create()
        result = self.client.get(f"/api/v1/pricing/shared-quotes/{first['id']}").json()
        self.assertEqual(result["quote"]["bid"], 8000)
        self.assertEqual(result["quote"]["total_usd"], 12500)

    def test_unknown_and_malformed_tokens_are_not_found(self):
        for token in ("A" * 32, "1", "bad-token", "B" * 100):
            with self.subTest(token=token):
                response = self.client.get(f"/api/v1/pricing/shared-quotes/{token}")
                self.assertEqual(response.status_code, 404)

    def test_invalid_snapshot_cannot_be_published(self):
        for changes in (
            {"total_usd": -1}, {"kind": "unknown"}, {"currency": "BTC"},
            {"title": "x" * 241}, {"lot_url": "javascript:alert(1)"},
            {"image_url": "data:text/html,bad"}, {"phone": "375291234567"},
            {"breakdown": [{"label": "x", "amount": 1, "currency": "BTC"}]},
            {"breakdown": [{"label": "x", "amount": 1, "currency": "USD"}] * 61},
        ):
            with self.subTest(changes=changes):
                response = self.client.post(
                    "/api/v1/pricing/shared-quotes", json={**self.body, **changes}
                )
                self.assertEqual(response.status_code, 422, response.text)

    def test_non_finite_amounts_are_rejected(self):
        for value in ("NaN", "Infinity", "-Infinity"):
            response = self.client.post(
                "/api/v1/pricing/shared-quotes", json={**self.body, "total_usd": value}
            )
            self.assertEqual(response.status_code, 422, response.text)

    def test_history_snapshot_without_breakdown_can_be_shared(self):
        body = {**self.body, "breakdown": [], "image_url": ""}
        self.assertEqual(self.create(body)["quote"], body)

    def test_reads_survive_a_new_request_and_are_not_only_in_memory(self):
        shared = self.create()
        self.assertTrue(self.db.exists())
        with sqlite3.connect(self.db) as conn:
            tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertIn("quote_shares", tables)
        response = self.client.get(f"/api/v1/pricing/shared-quotes/{shared['id']}")
        self.assertEqual(response.json()["quote"]["total_usd"], 12500)

    def test_supported_local_photos_can_be_shared(self):
        for image in ("/api/lot-photos/copart-123/01-car.jpg", "/api/lot-image?u=https%3A%2F%2Fimages.bid.cars%2Fa.jpg", "/auctions/lots/car.jpg"):
            with self.subTest(image=image):
                body = {**self.body, "image_url": image}
                self.assertEqual(self.create(body)["quote"]["image_url"], image)

    def test_shared_quote_keeps_full_photo_gallery(self):
        images = [f"https://images.bid.cars/photo-{index}.jpg" for index in range(1, 81)]
        response = self.client.post(
            "/api/v1/pricing/shared-quotes",
            json={**self.body, "image_url": images[0], "image_urls": images},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["quote"]["image_urls"], images)

    def test_shared_quote_rejects_non_http_photo_in_gallery(self):
        response = self.client.post(
            "/api/v1/pricing/shared-quotes",
            json={**self.body, "image_urls": ["javascript:alert(1)"]},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
