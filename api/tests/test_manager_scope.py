import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings
from app.models.cabinet import DealCreate
from app.routers import cabinet as cabinet_router
from app.routers import logistics as logistics_router
from app.services.auth_deps import create_access_token
from app.services.cabinet_store import CabinetStore


class ManagerScopeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.store = CabinetStore()
        self.store._path = lambda: root / "cabinet.db"
        self.store._uploads = lambda: root / "uploads"
        self.store.init()
        with sqlite3.connect(root / "cabinet.db") as conn:
            rows = [
                (1, 1, 0, None),  # администратор
                (2, 0, 1, None),  # менеджер A
                (3, 0, 1, None),  # менеджер B
                (4, 0, 0, 2),  # клиент A
                (5, 0, 0, 3),  # клиент B
            ]
            for uid, _admin, manager, owner in rows:
                conn.execute(
                    "INSERT INTO users (id, telegram_id, first_name, is_manager, "
                    "manager_user_id, created_at) VALUES (?, ?, ?, ?, ?, '2026-01-01')",
                    (uid, 100 + uid, f"u{uid}", manager, owner),
                )
        admin_check = mock.patch(
            "app.services.cabinet_store.is_admin_telegram", lambda tid: tid == 101
        )
        admin_check.start()
        self.addCleanup(admin_check.stop)
        self.mine = self.store.create_deal(
            DealCreate(telegram_id=104, title="мой", dismantle_yard="texas")
        )
        self.other = self.store.create_deal(
            DealCreate(telegram_id=105, title="чужой", dismantle_yard="texas")
        )
        patches = [
            mock.patch.object(cabinet_router, "cabinet_store", self.store),
            mock.patch("app.services.auth_deps.cabinet_store", self.store),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        app = FastAPI()
        app.include_router(cabinet_router.router, prefix="/api/v1")
        app.include_router(logistics_router.router, prefix="/api/v1")
        self.client = TestClient(app, raise_server_exceptions=True)

    def tearDown(self):
        self.tmp.cleanup()

    def auth(self, uid):
        token = create_access_token(
            telegram_id=100 + uid, user_id=uid, settings=get_settings()
        )
        return {"Authorization": f"Bearer {token}"}

    def test_manager_lists_only_own_deals_and_clients(self):
        h = self.auth(2)
        deals = self.client.get("/api/v1/admin/deals", headers=h).json()
        self.assertEqual([d["title"] for d in deals], ["мой"])
        ids = {u["id"] for u in self.client.get("/api/v1/admin/users", headers=h).json()}
        self.assertEqual(ids, {2, 4})

    def test_admin_still_sees_everything(self):
        deals = self.client.get("/api/v1/admin/deals", headers=self.auth(1)).json()
        self.assertEqual(len(deals), 2)

    def test_manager_cannot_create_deals(self):
        body = {"telegram_id": 104, "title": "новая", "dismantle_yard": "texas"}
        res = self.client.post("/api/v1/admin/deals", json=body, headers=self.auth(2))
        self.assertEqual(res.status_code, 403)
        res = self.client.post("/api/v1/admin/deals", json=body, headers=self.auth(1))
        self.assertEqual(res.status_code, 200)

    def test_manager_changes_stage_only_on_own_deal(self):
        h = self.auth(2)
        body = {"status": "done", "note": ""}
        url = "/api/v1/admin/deals/{}/stages/auction"
        self.assertEqual(self.client.post(url.format(self.mine.id), json=body, headers=h).status_code, 200)
        self.assertEqual(self.client.post(url.format(self.other.id), json=body, headers=h).status_code, 403)

    def test_manager_cannot_open_foreign_deal(self):
        h = self.auth(2)
        self.assertEqual(self.client.get(f"/api/v1/me/deals/{self.mine.id}", headers=h).status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/me/deals/{self.other.id}", headers=h).status_code, 403)
        res = self.client.get(f"/api/v1/me/deals/{self.other.id}/dismantle-map", headers=h)
        self.assertEqual(res.status_code, 403)

    def test_manager_patch_limited_to_progress_fields(self):
        h = self.auth(2)
        url = f"/api/v1/admin/deals/{self.mine.id}"
        self.assertEqual(self.client.patch(url, json={"dismantle_yard": "new_jersey"}, headers=h).status_code, 200)
        self.assertEqual(self.client.patch(url, json={"price": 1}, headers=h).status_code, 403)
        self.assertEqual(self.client.patch(url, json={"title": "x"}, headers=h).status_code, 403)
        foreign = f"/api/v1/admin/deals/{self.other.id}"
        self.assertEqual(self.client.patch(foreign, json={"car_status": ""}, headers=h).status_code, 403)

    def test_manager_cannot_touch_payment_or_logistics(self):
        h = self.auth(2)
        res = self.client.post(
            f"/api/v1/admin/deals/{self.mine.id}/payment", json={"stage": 1, "paid": True}, headers=h
        )
        self.assertEqual(res.status_code, 403)
        paths = [r.path for r in logistics_router.router.routes if "GET" in getattr(r, "methods", set())]
        path = next(p for p in paths if "{" not in p)
        self.assertEqual(self.client.get(f"/api/v1{path}", headers=h).status_code, 403)

    def test_client_is_unaffected(self):
        h = self.auth(4)
        self.assertEqual(self.client.get(f"/api/v1/me/deals/{self.mine.id}", headers=h).status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/me/deals/{self.other.id}", headers=h).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/admin/deals", headers=h).status_code, 403)


if __name__ == "__main__":
    unittest.main()
