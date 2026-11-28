import unittest

from tests import test_manager_scope as scope


class PurchaseDateTests(unittest.TestCase):
    setUp = scope.ManagerScopeTest.setUp
    tearDown = scope.ManagerScopeTest.tearDown
    auth = scope.ManagerScopeTest.auth

    def test_create_and_reload_purchase_date_independent_of_card_creation(self):
        res = self.client.post("/api/v1/admin/deals", headers=self.auth(2), json={
            "telegram_id": 104, "title": "Toyota", "kind": "car", "purchase_date": "2025-08-14",
        })
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json().get("purchase_date"), "2025-08-14")
        detail = self.client.get(f"/api/v1/me/deals/{res.json()['id']}", headers=self.auth(4)).json()
        self.assertEqual(detail["purchase_date"], "2025-08-14")
        self.assertNotEqual(detail["created_at"][:10], "2025-08-14")

    def test_manager_sets_keeps_and_clears_date_for_own_car(self):
        url = f"/api/v1/admin/deals/{self.mine.id}"
        res = self.client.patch(url, headers=self.auth(2), json={"purchase_date": "2024-02-29"})
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json().get("purchase_date"), "2024-02-29")
        kept = self.client.patch(url, headers=self.auth(2), json={"car_status": "purchased"})
        self.assertEqual(kept.json()["purchase_date"], "2024-02-29")
        cleared = self.client.patch(url, headers=self.auth(2), json={"purchase_date": None})
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()["purchase_date"])

    def test_existing_cars_have_no_invented_purchase_date(self):
        res = self.client.get(f"/api/v1/me/deals/{self.mine.id}", headers=self.auth(4))
        self.assertIn("purchase_date", res.json())
        self.assertIsNone(res.json()["purchase_date"])

    def test_invalid_calendar_dates_and_foreign_edits_are_rejected(self):
        url = f"/api/v1/admin/deals/{self.mine.id}"
        for day in ("2025-02-30", "2025-13-01", "not-a-date"):
            self.assertEqual(self.client.patch(url, headers=self.auth(2), json={"purchase_date": day}).status_code, 422)
        self.assertEqual(self.client.patch(f"/api/v1/admin/deals/{self.other.id}", headers=self.auth(2), json={"purchase_date": "2025-08-14"}).status_code, 403)
