from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services import sms_by
from app.services.logistics_store import LogisticsStore
from app.services.sms_by import SmsSendResult


class SmsLogStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        db = str(Path(self.tmp.name) / "cabinet.db")
        self.patcher = patch(
            "app.services.logistics_store.get_settings",
            return_value=SimpleNamespace(cabinet_db_path=db),
        )
        self.patcher.start()
        self.store = LogisticsStore()
        self.store.init()

    def tearDown(self):
        self.patcher.stop()
        self.tmp.cleanup()

    def _log(self, **kw):
        base = dict(
            container_id=7,
            container_code="MSKU-1",
            stage="ocean",
            deal_ids=[11, 12],
            cars="2020 BMW X5, 2019 Audi Q7",
            client_name="Иван",
            phone="+375291234567",
            message="MG.GROUP: контейнер MSKU-1 в море",
        )
        base.update(kw)
        return self.store.log_sms(**base)

    def test_queued_then_sent_then_delivered(self):
        log_id = self._log()
        rows = self.store.list_sms_log(container_id=7)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].status, "queued")
        self.assertEqual(rows[0].status_label, "В очереди")
        self.assertEqual(rows[0].deal_ids, [11, 12])
        self.assertEqual(rows[0].stage_label, "В море")

        self.store.mark_sms_result(log_id, ok=True, sms_id=2197871)
        row = self.store.list_sms_log(ids=[log_id])[0]
        self.assertEqual((row.status, row.sms_id), ("sent", 2197871))
        self.assertTrue(row.sent_at)
        self.assertEqual([r.id for r in self.store.sms_log_pending_delivery()], [log_id])

        self.store.mark_sms_delivery(log_id, delivered_at="2026-11-03T10:00:00+00:00")
        row = self.store.list_sms_log(ids=[log_id])[0]
        self.assertEqual(row.status, "delivered")
        self.assertEqual(row.delivered_at, "2026-11-03T10:00:00+00:00")
        self.assertEqual(self.store.sms_log_pending_delivery(), [])

    def test_failed_and_skipped(self):
        a = self._log()
        self.store.mark_sms_result(a, ok=False, error="http_429")
        b = self._log(phone="", message="", status="skipped", error="Нет телефона клиента")
        c = self._log()
        self.store.mark_sms_result(c, ok=False, skipped=True, error="disabled")
        rows = {r.id: r for r in self.store.list_sms_log()}
        self.assertEqual((rows[a].status, rows[a].error), ("failed", "http_429"))
        self.assertEqual(rows[b].status, "skipped")
        self.assertEqual((rows[c].status, rows[c].error), ("skipped", "disabled"))
        self.assertEqual(self.store.sms_log_pending_delivery(), [])

    def test_filter_by_container_and_limit(self):
        self._log(container_id=1)
        self._log(container_id=2)
        self._log(container_id=2)
        self.assertEqual(len(self.store.list_sms_log(container_id=2)), 2)
        self.assertEqual(len(self.store.list_sms_log(limit=1)), 1)


class SmsQueueCallbackTests(unittest.TestCase):
    def test_queue_reports_each_result_with_log_id(self):
        seen: list[tuple[int, bool]] = []

        async def fake_send(phone, message):
            return SmsSendResult(ok=phone.endswith("1"), sms_id=5 if phone.endswith("1") else None, error="" if phone.endswith("1") else "http_500")

        with patch.object(sms_by, "send_sms_with_retries", side_effect=fake_send):
            asyncio.run(
                sms_by.send_sms_queue(
                    [("375291", "a", 10), ("375292", "b", 11), ("375293", "c")],
                    gap_sec=0,
                    on_result=lambda log_id, r: seen.append((log_id, r.ok)),
                )
            )
        self.assertEqual(seen, [(10, True), (11, False)])


class CheckSmsTests(unittest.TestCase):
    def test_check_sms_parses_timestamps(self):
        class _Res:
            status_code = 200
            content = b"{}"

            def json(self):
                return {"sms_id": 2637396, "sent": 1616407661, "delivered": 1616407673}

        class _Client:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def get(self, url, params=None):
                assert url.endswith("/checkSMS") and params["sms_id"] == 2637396
                return _Res()

        with patch.object(sms_by, "get_settings", return_value=SimpleNamespace(sms_by_enabled=True, sms_by_token="t")), patch.object(
            sms_by.httpx, "AsyncClient", _Client
        ):
            res = asyncio.run(sms_by.check_sms(2637396))
        self.assertTrue(res.ok)
        self.assertEqual(res.sent_at, "2021-03-22T10:07:41+00:00")
        self.assertEqual(res.delivered_at, "2021-03-22T10:07:53+00:00")

    def test_check_sms_not_configured(self):
        with patch.object(sms_by, "get_settings", return_value=SimpleNamespace(sms_by_enabled=False, sms_by_token="")):
            res = asyncio.run(sms_by.check_sms(1))
        self.assertFalse(res.ok)
        self.assertEqual(res.error, "not_configured")


if __name__ == "__main__":
    unittest.main()


class ManagerMapCompletedSmsTests(unittest.TestCase):
    def test_message_text(self):
        text = sms_by.format_map_completed_message(car="2021 Toyota Camry", client="Иван", deal_id=8)
        self.assertIn("Иван заполнил карту разбора", text)
        self.assertIn("сделка #8", text)
        self.assertIn("mg-group.by/cabinet", text)

    def test_no_phone_is_skipped_without_sending(self):
        with patch.object(sms_by, "send_sms_with_retries") as send:
            res = asyncio.run(sms_by.notify_manager_map_completed(phone="", car="x", client="y", deal_id=1))
        self.assertTrue(res.skipped)
        self.assertEqual(res.error, "no_phone")
        send.assert_not_called()

    def test_with_phone_sends(self):
        async def fake(phone, message):
            return SmsSendResult(ok=True, sms_id=42)

        with patch.object(sms_by, "send_sms_with_retries", side_effect=fake):
            res = asyncio.run(sms_by.notify_manager_map_completed(phone="+375291112233", car="x", client="y", deal_id=1))
        self.assertTrue(res.ok)
        self.assertEqual(res.sms_id, 42)
