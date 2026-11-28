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
                (6, 0, 0, None),  # логист
            ]
            for uid, _admin, manager, owner in rows:
                conn.execute(
                    "INSERT INTO users (id, telegram_id, first_name, is_manager, "
                    "manager_user_id, created_at) VALUES (?, ?, ?, ?, ?, '2026-01-01')",
                    (uid, 100 + uid, f"u{uid}", manager, owner),
                )
            conn.execute("UPDATE users SET is_logist = 1 WHERE id = 6")
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

    def test_manager_lists_all_deals_and_clients(self):
        h = self.auth(2)
        deals = self.client.get("/api/v1/admin/deals", headers=h).json()
        self.assertEqual({d["title"] for d in deals}, {"мой", "чужой"})
        ids = {u["id"] for u in self.client.get("/api/v1/admin/users", headers=h).json()}
        self.assertEqual(ids, {1, 2, 3, 4, 5, 6})

    def test_manager_can_view_car_photos_of_any_client(self):
        photo = self.store.add_media(
            deal_id=self.other.id, kind="photo", content=b"car photo", filename="car.jpg"
        )
        listed = self.client.get("/api/v1/admin/deals", headers=self.auth(2)).json()
        other = next(deal for deal in listed if deal["id"] == self.other.id)
        self.assertEqual(other["media"][0]["id"], photo.id)
        res = self.client.get(photo.url, headers=self.auth(2))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, b"car photo")
        token = self.auth(2)["Authorization"].removeprefix("Bearer ")
        thumbnail = self.client.get(photo.url, params={"access_token": token})
        self.assertEqual(thumbnail.status_code, 200)
        self.assertEqual(thumbnail.content, b"car photo")

    def test_client_cannot_view_another_clients_car_photo(self):
        photo = self.store.add_media(
            deal_id=self.other.id, kind="photo", content=b"car photo", filename="car.jpg"
        )
        self.assertEqual(self.client.get(photo.url).status_code, 401)
        self.assertEqual(self.client.get(photo.url, headers=self.auth(4)).status_code, 403)
        self.assertEqual(self.client.get(photo.url, headers=self.auth(5)).status_code, 200)

    def test_foreign_deal_documents_stay_restricted_to_its_manager(self):
        document = self.store.add_media(
            deal_id=self.other.id, kind="document", content=b"contract", filename="contract.pdf"
        )
        self.assertEqual(self.client.get(document.url, headers=self.auth(2)).status_code, 403)
        self.assertEqual(self.client.get(document.url, headers=self.auth(3)).status_code, 200)

    def test_client_deals_are_ordered_by_purchase_date(self):
        older = self.store.create_deal(
            DealCreate(telegram_id=104, title="куплена первой", dismantle_yard="texas")
        )
        newer = self.store.create_deal(
            DealCreate(telegram_id=104, title="куплена второй", dismantle_yard="texas")
        )
        with sqlite3.connect(self.store._path()) as conn:
            conn.execute(
                "UPDATE deals SET created_at = ?, updated_at = ? WHERE id = ?",
                ("2026-01-01T10:00:00+00:00", "2026-01-03T10:00:00+00:00", older.id),
            )
            conn.execute(
                "UPDATE deals SET created_at = ?, updated_at = ? WHERE id = ?",
                ("2026-01-02T10:00:00+00:00", "2026-01-02T10:00:00+00:00", newer.id),
            )

        deals = self.store.list_deals_for_user(4)

        self.assertEqual(
            [deal.title for deal in deals],
            ["куплена первой", "куплена второй", "мой"],
        )

    def _add_client(self, uid, owner):
        with sqlite3.connect(self.store._path()) as conn:
            conn.execute(
                "INSERT INTO users (id, telegram_id, first_name, manager_user_id, created_at) "
                "VALUES (?, ?, ?, ?, '2026-01-01')",
                (uid, 100 + uid, f"u{uid}", owner),
            )
            conn.execute(
                "INSERT INTO favorites (user_id, lot_id, created_at) VALUES (?, 'lot-1', '2026-01-01')",
                (uid,),
            )

    def test_delete_account_rules(self):
        self._add_client(7, 2)
        self._add_client(8, 3)
        mgr = self.auth(2)
        # чужой клиент, клиент со сделкой, админ и сам себя — нельзя
        self.assertEqual(self.client.delete("/api/v1/admin/users/8", headers=mgr).status_code, 403)
        self.assertEqual(self.client.delete("/api/v1/admin/users/4", headers=mgr).status_code, 409)
        self.assertEqual(self.client.delete("/api/v1/admin/users/1", headers=mgr).status_code, 403)
        self.assertEqual(self.client.delete("/api/v1/admin/users/2", headers=mgr).status_code, 422)
        # свой клиент без сделок — удаляется вместе с избранным
        self.assertEqual(self.client.delete("/api/v1/admin/users/7", headers=mgr).status_code, 200)
        self.assertIsNone(self.store.get_user(7))
        with sqlite3.connect(self.store._path()) as conn:
            left = conn.execute("SELECT COUNT(*) FROM favorites WHERE user_id = 7").fetchone()[0]
        self.assertEqual(left, 0)
        # админ удаляет любого клиента без сделок
        self.assertEqual(self.client.delete("/api/v1/admin/users/8", headers=self.auth(1)).status_code, 200)

    def test_admin_still_sees_everything(self):
        deals = self.client.get("/api/v1/admin/deals", headers=self.auth(1)).json()
        self.assertEqual(len(deals), 2)

    def test_manager_adds_deals_only_for_own_clients(self):
        body = {"telegram_id": 104, "title": "новая", "dismantle_yard": "texas"}
        h = self.auth(2)
        res = self.client.post("/api/v1/admin/deals", json={**body, "manager_user_id": 3}, headers=h)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["manager_user_id"], 2)
        foreign = {**body, "telegram_id": 105}
        self.assertEqual(self.client.post("/api/v1/admin/deals", json=foreign, headers=h).status_code, 403)
        self.assertEqual(self.client.post("/api/v1/admin/deals", json=foreign, headers=self.auth(1)).status_code, 200)

    def test_manager_changes_stage_only_on_own_deal(self):
        h = self.auth(2)
        body = {"status": "done", "note": ""}
        url = "/api/v1/admin/deals/{}/stages/auction"
        self.assertEqual(self.client.post(url.format(self.mine.id), json=body, headers=h).status_code, 200)
        self.assertEqual(self.client.post(url.format(self.other.id), json=body, headers=h).status_code, 403)

    def test_manager_can_read_foreign_deal(self):
        h = self.auth(2)
        self.assertEqual(self.client.get(f"/api/v1/me/deals/{self.mine.id}", headers=h).status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/me/deals/{self.other.id}", headers=h).status_code, 200)
        res = self.client.get(f"/api/v1/me/deals/{self.other.id}/dismantle-map", headers=h)
        self.assertEqual(res.status_code, 200)

    def test_manager_patch_limited_to_progress_fields(self):
        h = self.auth(2)
        url = f"/api/v1/admin/deals/{self.mine.id}"
        self.assertEqual(self.client.patch(url, json={"dismantle_yard": "new_jersey"}, headers=h).status_code, 200)
        self.assertEqual(self.client.patch(url, json={"price": 1}, headers=h).status_code, 403)
        self.assertEqual(self.client.patch(url, json={"title": "x"}, headers=h).status_code, 403)
        foreign = f"/api/v1/admin/deals/{self.other.id}"
        self.assertEqual(self.client.patch(foreign, json={"car_status": ""}, headers=h).status_code, 403)

    def test_manager_sets_payment_only_on_own_deal(self):
        h = self.auth(2)
        url = "/api/v1/admin/deals/{}/payment"
        res = self.client.post(
            url.format(self.mine.id), json={"stage": 1, "paid": True, "paid_on": "2026-11-02"}, headers=h
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["payment_stage1_paid"])
        self.assertEqual(res.json()["payment_stage1_at"], "2026-11-02")
        foreign = self.client.post(url.format(self.other.id), json={"stage": 1, "paid": True}, headers=h)
        self.assertEqual(foreign.status_code, 403)
        future = self.client.post(
            url.format(self.mine.id), json={"stage": 2, "paid": True, "paid_on": "2099-01-01"}, headers=h
        )
        self.assertEqual(future.status_code, 422)
        due = self.client.patch(
            f"/api/v1/admin/deals/{self.mine.id}", json={"payment_stage1_due": "2026-12-01"}, headers=h
        )
        self.assertEqual(due.status_code, 200)
        self.assertEqual(due.json()["payment_stage1_due"], "2026-12-01")

    def test_manager_cannot_touch_logistics(self):
        h = self.auth(2)
        paths = [r.path for r in logistics_router.router.routes if "GET" in getattr(r, "methods", set())]
        path = next(p for p in paths if "{" not in p)
        self.assertEqual(self.client.get(f"/api/v1{path}", headers=h).status_code, 403)

    def test_client_is_unaffected(self):
        h = self.auth(4)
        self.assertEqual(self.client.get(f"/api/v1/me/deals/{self.mine.id}", headers=h).status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/me/deals/{self.other.id}", headers=h).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/admin/deals", headers=h).status_code, 403)

    def test_logist_sees_logistics_only(self):
        h = self.auth(6)
        with mock.patch.object(logistics_router, "logistics_store") as store:
            store.list_containers.return_value = []
            res = self.client.get("/api/v1/admin/logistics/containers", headers=h)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.client.get("/api/v1/admin/deals", headers=h).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/admin/users", headers=h).status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/me/deals/{self.mine.id}", headers=h).status_code, 403)

    def test_admin_assigns_and_removes_logist(self):
        url = "/api/v1/admin/users/4"
        self.assertEqual(self.client.patch(url, json={"is_logist": True}, headers=self.auth(2)).status_code, 403)
        res = self.client.patch(url, json={"is_logist": True}, headers=self.auth(1))
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["is_logist"])
        # Роль менеджера при этом не трогается.
        self.assertFalse(res.json()["is_manager"])
        res = self.client.patch(url, json={"is_logist": False}, headers=self.auth(1))
        self.assertFalse(res.json()["is_logist"])
        self.assertEqual(self.client.patch(url, json={}, headers=self.auth(1)).status_code, 422)

    def test_manager_claims_self_registered_phone_client(self):
        user = self.store.create_client_account(
            phone="375291234567", password="test-password", first_name="Клиент"
        )
        self.assertEqual(user.manager_user_id, 0)
        res = self.client.put(
            f"/api/v1/admin/clients/{user.id}/manager",
            json={"manager_user_id": 2, "expected_manager_user_id": 0},
            headers=self.auth(2),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["manager_user_id"], 2)
        self.assertEqual(self.store.get_user(user.id).manager_user_id, 2)
        deal = self.client.post(
            "/api/v1/admin/deals",
            json={"telegram_id": user.telegram_id, "title": "Новая сделка", "kind": "car"},
            headers=self.auth(2),
        )
        self.assertEqual(deal.status_code, 200)
        self.assertEqual(deal.json()["manager_user_id"], 2)

    def test_claim_also_assigns_existing_unassigned_deals(self):
        self._add_client(7, None)
        deal = self.store.create_deal(DealCreate(telegram_id=107, title="Без менеджера"))
        res = self.client.put(
            "/api/v1/admin/clients/7/manager",
            json={"manager_user_id": 2, "expected_manager_user_id": 0},
            headers=self.auth(2),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.store.get_deal(deal.id).manager_user_id, 2)

    def test_any_manager_transfers_client_and_all_deals(self):
        # Клиент создан менеджером B; сделки могли назначаться разным сотрудникам.
        user = self.store.create_client_account(
            phone="375291234568", password="test-password", manager_user_id=3
        )
        first = self.store.create_deal(
            DealCreate(telegram_id=user.telegram_id, title="Первая"), created_by_user_id=3
        )
        second = self.store.create_deal(
            DealCreate(telegram_id=user.telegram_id, title="Вторая", manager_user_id=1)
        )
        res = self.client.put(
            f"/api/v1/admin/clients/{user.id}/manager",
            json={"manager_user_id": 2, "expected_manager_user_id": 3},
            headers=self.auth(2),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["manager_user_id"], 2)
        for deal in (first, second):
            with self.subTest(deal=deal.id):
                updated = self.store.get_deal(deal.id)
                self.assertEqual(updated.manager_user_id, 2)
                self.assertEqual(updated.manager_name, "u2")
                self.assertTrue(self.store.manager_owns_deal(manager_id=2, deal_id=deal.id))
                self.assertFalse(self.store.manager_owns_deal(manager_id=3, deal_id=deal.id))
        url = f"/api/v1/admin/deals/{first.id}/stages/auction"
        body = {"status": "done"}
        self.assertEqual(self.client.post(url, json=body, headers=self.auth(3)).status_code, 403)
        self.assertEqual(self.client.post(url, json=body, headers=self.auth(2)).status_code, 200)
        self.assertEqual(
            self.client.get(f"/api/v1/me/deals/{first.id}", headers=self.auth(3)).status_code, 200
        )
        self.assertEqual(self.store.get_user(5).manager_user_id, 3)
        self.assertEqual(self.store.get_deal(self.other.id).manager_user_id, 3)

    def test_manager_assigns_foreign_client_to_another_staff_member(self):
        res = self.client.put(
            "/api/v1/admin/clients/5/manager",
            json={"manager_user_id": 1, "expected_manager_user_id": 3},
            headers=self.auth(2),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["manager_user_id"], 1)
        self.assertEqual(self.store.get_deal(self.other.id).manager_user_id, 1)

    def test_admin_can_reassign_client(self):
        res = self.client.put(
            "/api/v1/admin/clients/4/manager",
            json={"manager_user_id": 3, "expected_manager_user_id": 2},
            headers=self.auth(1),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.store.get_user(4).manager_user_id, 3)
        self.assertEqual(self.store.get_deal(self.mine.id).manager_user_id, 3)

    def test_client_and_logist_cannot_reassign_clients(self):
        url = "/api/v1/admin/clients/5/manager"
        body = {"manager_user_id": 2, "expected_manager_user_id": 3}
        for uid in (4, 6):
            with self.subTest(actor=uid):
                self.assertEqual(self.client.put(url, json=body, headers=self.auth(uid)).status_code, 403)
        self.assertEqual(self.client.put(url, json=body).status_code, 401)
        self.assertEqual(self.store.get_user(5).manager_user_id, 3)

    def test_staff_and_missing_client_cannot_be_assigned(self):
        for uid, status in ((1, 422), (2, 422), (6, 422), (999, 404)):
            with self.subTest(client=uid):
                res = self.client.put(
                    f"/api/v1/admin/clients/{uid}/manager",
                    json={"manager_user_id": 3, "expected_manager_user_id": 0},
                    headers=self.auth(2),
                )
                self.assertEqual(res.status_code, status)

    def test_invalid_assignee_keeps_client_and_deals_unchanged(self):
        for assignee in (4, 6, 999):
            with self.subTest(assignee=assignee):
                res = self.client.put(
                    "/api/v1/admin/clients/5/manager",
                    json={"manager_user_id": assignee, "expected_manager_user_id": 3},
                    headers=self.auth(2),
                )
                self.assertEqual(res.status_code, 422)
                self.assertEqual(self.store.get_user(5).manager_user_id, 3)
                self.assertEqual(self.store.get_deal(self.other.id).manager_user_id, 3)

    def test_stale_assignment_cannot_overwrite_new_manager(self):
        self._add_client(7, None)
        url = "/api/v1/admin/clients/7/manager"
        first = self.client.put(
            url, json={"manager_user_id": 2, "expected_manager_user_id": 0}, headers=self.auth(2)
        )
        self.assertEqual(first.status_code, 200)
        stale = self.client.put(
            url, json={"manager_user_id": 3, "expected_manager_user_id": 0}, headers=self.auth(3)
        )
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.store.get_user(7).manager_user_id, 2)

    def test_assignment_requires_valid_ids_and_expected_manager(self):
        for body in (
            {"manager_user_id": 0, "expected_manager_user_id": 3},
            {"manager_user_id": -1, "expected_manager_user_id": 3},
            {"manager_user_id": 2, "expected_manager_user_id": -1},
            {"manager_user_id": 2},
        ):
            with self.subTest(body=body):
                res = self.client.put(
                    "/api/v1/admin/clients/5/manager", json=body, headers=self.auth(2)
                )
                self.assertEqual(res.status_code, 422)

    def test_assignment_rolls_back_if_deal_update_fails(self):
        with sqlite3.connect(self.store._path()) as conn:
            conn.execute(
                "CREATE TRIGGER reject_transfer BEFORE UPDATE OF created_by_user_id ON deals "
                "BEGIN SELECT RAISE(ABORT, 'transfer failed'); END"
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.client.put(
                "/api/v1/admin/clients/5/manager",
                json={"manager_user_id": 2, "expected_manager_user_id": 3},
                headers=self.auth(2),
            )
        self.assertEqual(self.store.get_user(5).manager_user_id, 3)
        self.assertEqual(self.store.get_deal(self.other.id).manager_user_id, 3)

    def test_old_manager_cannot_create_deal_during_transfer(self):
        create_deal = self.store.create_deal

        def transfer_then_create(data, **kwargs):
            self.store.assign_client_manager(
                4, manager_user_id=3, expected_manager_user_id=2
            )
            return create_deal(data, **kwargs)

        # Pause after the route's ownership check, then transfer before insertion.
        with mock.patch.object(self.store, "create_deal", side_effect=transfer_then_create):
            res = self.client.post(
                "/api/v1/admin/deals",
                json={"telegram_id": 104, "title": "После передачи", "kind": "car"},
                headers=self.auth(2),
            )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.store.get_user(4).manager_user_id, 3)
        self.assertEqual(len(self.store.list_deals_for_user(4)), 1)
        self.assertFalse(self.store.manager_owns_deal(manager_id=2, deal_id=self.mine.id))


if __name__ == "__main__":
    unittest.main()
