import sqlite3
import unittest
from tests import test_manager_scope as scope
from app.models.cabinet import DealCreate
from app.services.logistics_store import LogisticsStore


class ClientEditingTests(unittest.TestCase):
    setUp = scope.ManagerScopeTest.setUp
    tearDown = scope.ManagerScopeTest.tearDown
    auth = scope.ManagerScopeTest.auth

    def photo(self, deal=None, **kwargs):
        return self.store.add_media(deal_id=(deal or self.mine).id, kind="photo", content=b"photo", filename="car.jpg", **kwargs)

    def test_delete_one_photo_keeps_other_media_and_client(self):
        first, second = self.photo(), self.photo()
        removed_path = self.store.get_media_file(first.id)[0]
        kept_path = self.store.get_media_file(second.id)[0]
        url = f"/api/v1/admin/deals/{self.mine.id}/media/{first.id}"
        self.assertEqual(self.client.delete(url, headers=self.auth(2)).status_code, 204)
        self.assertFalse(removed_path.exists())
        self.assertTrue(kept_path.exists())
        self.assertEqual([m.id for m in self.store.get_deal(self.mine.id).media], [second.id])
        self.assertIsNotNone(self.store.get_user(4))
        self.assertEqual(self.client.delete(url, headers=self.auth(2)).status_code, 404)

    def test_photo_deletion_enforces_ownership_and_deal_media_pair(self):
        photo = self.photo(self.other)
        url = f"/api/v1/admin/deals/{self.other.id}/media/{photo.id}"
        for uid in (2, 4, 6):
            self.assertEqual(self.client.delete(url, headers=self.auth(uid)).status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 401)
        mismatch = f"/api/v1/admin/deals/{self.mine.id}/media/{photo.id}"
        self.assertEqual(self.client.delete(mismatch, headers=self.auth(2)).status_code, 404)
        self.assertTrue(self.store.get_media_file(photo.id)[0].exists())
        self.assertEqual(self.client.delete(url, headers=self.auth(1)).status_code, 204)

    def test_gallery_delete_does_not_remove_documents_or_claim_photos(self):
        doc = self.store.add_media(deal_id=self.mine.id, kind="document", content=b"contract", filename="contract.pdf")
        claim = self.photo(claim_id=999)
        for media in (doc, claim):
            url = f"/api/v1/admin/deals/{self.mine.id}/media/{media.id}"
            self.assertEqual(self.client.delete(url, headers=self.auth(2)).status_code, 404)
            self.assertTrue(self.store.get_media_file(media.id)[0].exists())

    def test_delete_deal_preserves_client_other_car_and_container(self):
        second = self.store.create_deal(DealCreate(telegram_id=104, title="Оставить"))
        photo = self.photo()
        photo_path = self.store.get_media_file(photo.id)[0]
        logistics = LogisticsStore()
        logistics._path = self.store._path
        logistics.init()
        with self.store._conn() as conn:
            conn.execute("INSERT INTO shipping_containers (id, code, created_at, updated_at) VALUES (1, 'TEST', '', '')")
            for deal_id in (self.mine.id, second.id):
                conn.execute("INSERT INTO container_items (container_id, deal_id, added_at) VALUES (1, ?, '')", (deal_id,))
            conn.execute("INSERT INTO deal_claims (deal_id, user_id, text, created_at) VALUES (?, 4, 'note', '')", (self.mine.id,))
        url = f"/api/v1/admin/deals/{self.mine.id}"
        self.assertEqual(self.client.delete(url, headers=self.auth(2)).status_code, 204)
        self.assertIsNone(self.store.get_deal(self.mine.id))
        self.assertIsNotNone(self.store.get_deal(second.id))
        self.assertIsNotNone(self.store.get_user(4))
        self.assertFalse(photo_path.exists())
        with self.store._conn() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM shipping_containers").fetchone()[0], 1)
            self.assertEqual([r[0] for r in conn.execute("SELECT deal_id FROM container_items")], [second.id])
            for table in ("deal_media", "deal_stages", "deal_claims"):
                self.assertEqual(conn.execute(f"SELECT COUNT(*) FROM {table} WHERE deal_id = ?", (self.mine.id,)).fetchone()[0], 0)
        self.assertEqual(self.client.delete(url, headers=self.auth(2)).status_code, 404)

    def test_deal_deletion_enforces_permissions(self):
        url = f"/api/v1/admin/deals/{self.other.id}"
        for uid in (2, 4, 6):
            self.assertEqual(self.client.delete(url, headers=self.auth(uid)).status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 401)
        self.assertIsNotNone(self.store.get_deal(self.other.id))
        self.assertEqual(self.client.delete(url, headers=self.auth(1)).status_code, 204)

    def test_deletion_rollback_restores_staged_photo_files(self):
        photo = self.photo()
        path = self.store.get_media_file(photo.id)[0]
        with self.store._conn() as conn:
            conn.execute("CREATE TRIGGER reject_deletion BEFORE DELETE ON deals BEGIN SELECT RAISE(ABORT, 'failed'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.delete_deal(self.mine.id, actor=self.store.get_user(2))
        self.assertTrue(path.exists())
        self.assertIsNotNone(self.store.get_deal(self.mine.id))
        self.assertIsNotNone(self.store.get_media_file(photo.id))

    def test_rename_updates_client_and_deal_without_changing_identity(self):
        old = self.store.get_user(4)
        res = self.client.patch("/api/v1/admin/clients/4/name", json={"first_name": " Иван ", "last_name": " Петров "}, headers=self.auth(2))
        self.assertEqual(res.status_code, 200, res.text)
        new = res.json()
        self.assertEqual((new["first_name"], new["last_name"]), ("Иван", "Петров"))
        for field in ("id", "telegram_id", "username", "phone", "manager_user_id", "is_manager", "is_admin"):
            self.assertEqual(new[field], getattr(old, field))
        self.assertEqual(self.store.get_deal(self.mine.id).client_name, "Иван Петров")

    def test_rename_validation_and_ownership(self):
        body = {"first_name": "Имя", "last_name": ""}
        for uid in (2, 4, 6):
            self.assertEqual(self.client.patch("/api/v1/admin/clients/5/name", json=body, headers=self.auth(uid)).status_code, 403)
        self.assertEqual(self.client.patch("/api/v1/admin/clients/5/name", json=body).status_code, 401)
        self.assertEqual(self.client.patch("/api/v1/admin/clients/5/name", json=body, headers=self.auth(1)).status_code, 200)
        for first in ("", "   ", "x" * 81):
            self.assertEqual(self.client.patch("/api/v1/admin/clients/4/name", json={"first_name": first}, headers=self.auth(2)).status_code, 422)
        for uid in (1, 2, 6):
            self.assertEqual(self.client.patch(f"/api/v1/admin/clients/{uid}/name", json=body, headers=self.auth(1)).status_code, 422)
        self.assertEqual(self.client.patch("/api/v1/admin/clients/999/name", json=body, headers=self.auth(1)).status_code, 404)

    def test_stale_manager_is_rejected_inside_write_transaction(self):
        actor = self.store.get_user(2)
        photo = self.photo()
        self.store.assign_client_manager(4, manager_user_id=3, expected_manager_user_id=2)
        for operation in (
            lambda: self.store.delete_deal(self.mine.id, actor=actor),
            lambda: self.store.delete_deal_photo(self.mine.id, photo.id, actor=actor),
            lambda: self.store.rename_client(4, first_name="Новое", last_name="", actor=actor),
        ):
            with self.assertRaises(PermissionError):
                operation()
        self.assertIsNotNone(self.store.get_deal(self.mine.id))
        self.assertTrue(self.store.get_media_file(photo.id)[0].exists())
        self.assertEqual(self.store.get_user(4).first_name, "u4")

    def test_detail_exposes_client_manager_when_deal_assignee_is_different(self):
        with self.store._conn() as conn:
            conn.execute("UPDATE deals SET created_by_user_id = 3 WHERE id = ?", (self.mine.id,))
        detail = self.client.get(f"/api/v1/me/deals/{self.mine.id}", headers=self.auth(2)).json()
        self.assertEqual(detail["manager_user_id"], 3)
        self.assertEqual(detail["client_manager_user_id"], 2)
        photo = self.photo()
        self.assertEqual(self.client.delete(f"/api/v1/admin/deals/{self.mine.id}/media/{photo.id}", headers=self.auth(2)).status_code, 204)
