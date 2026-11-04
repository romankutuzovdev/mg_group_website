from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx

from app.services import support_chat as sc


class SupportChatTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        settings = SimpleNamespace(
            cabinet_db_path=str(Path(self.tmp.name) / "c.db"),
            support_bot_token="t",
            support_chat_ids="111, 222",
        )
        self.patcher = patch.object(sc, "get_settings", return_value=settings)
        self.patcher.start()
        sc.init()
        self.sent: list[dict] = []
        self.fail: set[int] = set()

    def tearDown(self):
        self.patcher.stop()
        self.tmp.cleanup()

    def _transport(self):
        def handler(req):
            body = json.loads(req.content)
            self.sent.append(body)
            if body["chat_id"] in self.fail:
                return httpx.Response(403, json={"ok": False, "description": "blocked"})
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 1000 + len(self.sent)}})

        return httpx.MockTransport(handler)

    def _update(self, msg):
        async def go():
            async with httpx.AsyncClient(transport=self._transport()) as client:
                await sc.handle_update({"update_id": 1, "message": msg}, client)

        asyncio.run(go())

    def _notify(self):
        asyncio.run(sc.notify_managers("sess1234567890ab", "Нужен Camry", page="/avto/", transport=self._transport()))

    def test_message_reaches_both_managers_and_either_can_reply(self):
        self._notify()
        self.assertEqual([m["chat_id"] for m in self.sent], [111, 222])
        self.assertIn("Нужен Camry", self.sent[0]["text"])
        self.assertIn("/avto/", self.sent[0]["text"])

        self._update({
            "message_id": 5, "text": "Есть варианты", "chat": {"id": 222}, "from": {"first_name": "Аня"},
            "reply_to_message": {"message_id": 1002},
        })
        msgs = sc.list_messages("sess1234567890ab")
        self.assertEqual([(m["role"], m["content"]) for m in msgs], [("agent", "Есть варианты")])
        self.assertEqual(self.sent[-1]["chat_id"], 111)
        self.assertIn("Аня", self.sent[-1]["text"])

    def test_stranger_cannot_write_to_a_visitor(self):
        self._notify()
        self.sent.clear()
        self._update({"message_id": 5, "text": "спам", "chat": {"id": 999}, "reply_to_message": {"message_id": 1001}})
        self.assertEqual(sc.list_messages("sess1234567890ab"), [])
        self.assertEqual(self.sent, [])

    def test_reply_link_is_per_chat(self):
        self._notify()
        self._update({"message_id": 5, "text": "x", "chat": {"id": 222}, "reply_to_message": {"message_id": 1001}})
        self.assertEqual(sc.list_messages("sess1234567890ab"), [])
        self.assertEqual(self.sent[-1]["text"], sc.NEED_REPLY)

    def test_one_manager_down_is_fine_all_down_warns_visitor(self):
        self.fail = {111}
        self._notify()
        self.assertEqual(sc.list_messages("sess1234567890ab"), [])
        self.fail = {111, 222}
        self._notify()
        self.assertEqual(sc.list_messages("sess1234567890ab")[0]["content"], sc.FALLBACK)

    def test_photo_reply_is_refused(self):
        self._notify()
        self._update({"message_id": 5, "chat": {"id": 111}, "reply_to_message": {"message_id": 1001}})
        self.assertEqual(sc.list_messages("sess1234567890ab"), [])
        self.assertEqual(self.sent[-1]["text"], sc.TEXT_ONLY)

    def test_sessions_are_isolated_and_offset_persists(self):
        sc.add_message("aaaaaaaaaaaaaaaa", "user", "a")
        sc.add_message("bbbbbbbbbbbbbbbb", "user", "b")
        self.assertEqual([m["content"] for m in sc.list_messages("aaaaaaaaaaaaaaaa")], ["a"])
        sc.set_offset(42)
        self.assertEqual(sc.get_offset(), 42)


class OnlineTests(unittest.TestCase):
    def test_working_hours_in_minsk(self):
        from datetime import datetime, timezone

        monday_noon_minsk = datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)
        monday_night_minsk = datetime(2026, 11, 2, 17, 0, tzinfo=timezone.utc)
        saturday_noon_minsk = datetime(2026, 11, 7, 9, 0, tzinfo=timezone.utc)
        self.assertTrue(sc.is_online(monday_noon_minsk))
        self.assertFalse(sc.is_online(monday_night_minsk))
        self.assertFalse(sc.is_online(saturday_noon_minsk))
