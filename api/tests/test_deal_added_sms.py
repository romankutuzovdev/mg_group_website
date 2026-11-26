import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.cabinet import UserOut
from app.routers import cabinet as cabinet_router
from app.services.cabinet_store import CabinetStore
from app.services.sms_by import SmsSendResult


class DealAddedSmsTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        self.store = CabinetStore()
        self.store._path = lambda: root / "cabinet.db"
        self.store._uploads = lambda: root / "uploads"
        self.store.init()
        self.user = self.store.create_client_account(
            phone="375291234567", password="test-password", consent_service=True
        )
        store_patch = patch.object(cabinet_router, "cabinet_store", self.store)
        store_patch.start()
        self.addCleanup(store_patch.stop)
        send_patch = patch(
            "app.services.sms_by.send_sms", return_value=SmsSendResult(ok=True, sms_id=1)
        )
        self.send_sms = send_patch.start()
        self.addCleanup(send_patch.stop)
        app = FastAPI()
        app.include_router(cabinet_router.router, prefix="/api/v1")
        app.dependency_overrides[cabinet_router.require_admin_or_key] = lambda: UserOut(
            id=0, telegram_id=0, is_admin=True, created_at="2026-01-01"
        )
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def create_deal(self, **fields):
        response = self.client.post(
            "/api/v1/admin/deals",
            json={
                "telegram_id": self.user.telegram_id,
                "title": "2021 Toyota Camry",
                **fields,
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.store.get_deal(response.json()["id"]).kind, fields["kind"])
        return response.json()

    def test_registration_car_does_not_send_dismantle_map_sms(self):
        for region in ("usa", "uk", "china", "korea"):
            with self.subTest(region=region):
                self.create_deal(kind="car", origin_region=region)
                self.send_sms.assert_not_awaited()

    def test_kit_sends_dismantle_map_sms(self):
        for region, yard in (("usa", "texas"), ("usa", "new_jersey"), ("uk", "")):
            with self.subTest(region=region, yard=yard):
                self.send_sms.reset_mock()
                self.create_deal(kind="kit", origin_region=region, dismantle_yard=yard)
                self.send_sms.assert_awaited_once()
                phone, message = self.send_sms.await_args.args
                self.assertEqual(phone, "375291234567")
                self.assertIn("2021 Toyota Camry", message)
                self.assertIn("заполните карту разбора", message)

    def test_kit_without_service_consent_does_not_send_sms(self):
        with sqlite3.connect(self.store._path()) as conn:
            conn.execute("UPDATE users SET consent_service = 0 WHERE id = ?", (self.user.id,))
        self.create_deal(kind="kit", origin_region="uk")
        self.send_sms.assert_not_awaited()

    def test_kit_without_phone_does_not_send_sms(self):
        with sqlite3.connect(self.store._path()) as conn:
            conn.execute("UPDATE users SET phone = '' WHERE id = ?", (self.user.id,))
        self.create_deal(kind="kit", origin_region="uk")
        self.send_sms.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
