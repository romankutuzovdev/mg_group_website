from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services import showcase_picks
from app.services.showcase_picks import ShowcasePickIn, ShowcasePickPatch


class ShowcasePicksTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        db = str(Path(self.tmp.name) / "cabinet.db")
        self.patcher = patch(
            "app.services.showcase_picks.get_settings",
            return_value=SimpleNamespace(cabinet_db_path=db),
        )
        self.patcher.start()
        showcase_picks.init()

    def tearDown(self):
        self.patcher.stop()
        self.tmp.cleanup()

    def _save(self, **kw):
        base = dict(
            kind="restoration",
            title="2019 BMW X5",
            year=2019,
            make="BMW",
            model="X5",
            lot_url="https://bid.cars/en/lot/1-2019-bmw-x5",
            bid=8000,
            total_usd=21000,
            location="HOUSTON - TX",
        )
        base.update(kw)
        return showcase_picks.upsert(ShowcasePickIn(**base), manager_user_id=5, manager_name="Иван")

    def test_add_to_home_then_bought_moves_between_sections(self):
        pick = self._save(on_home=True)
        home = showcase_picks.list_public(section="home")
        self.assertEqual([p["id"] for p in home], [pick["id"]])
        self.assertNotIn("lot_url", home[0])
        self.assertNotIn("manager_name", home[0])

        showcase_picks.patch(pick["id"], ShowcasePickPatch(bought=True))
        self.assertEqual(showcase_picks.list_public(section="home"), [])
        bought = showcase_picks.list_public(section="bought")
        self.assertEqual(bought[0]["id"], pick["id"])
        self.assertTrue(bought[0]["bought_at"])

    def test_same_lot_updates_instead_of_duplicating(self):
        first = self._save(on_home=True, image_url="https://img/1.jpg")
        second = self._save(total_usd=22500, bought=True, image_url="")
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(second["total_usd"], 22500)
        self.assertEqual(second["image_url"], "https://img/1.jpg")
        self.assertTrue(second["bought"])
        self.assertFalse(second["on_home"])
        self.assertEqual(len(showcase_picks.list_all()), 1)

    def test_kind_filter_and_manager_scope(self):
        self._save(on_home=True)
        self._save(kind="kit", lot_url="https://www.copart.co.uk/lot/2", on_home=True)
        kits = showcase_picks.list_public(section="home", kind="kit")
        self.assertEqual([p["kind"] for p in kits], ["kit"])
        self.assertEqual(len(showcase_picks.list_all(manager_user_id=5)), 2)
        self.assertEqual(showcase_picks.list_all(manager_user_id=6), [])


if __name__ == "__main__":
    unittest.main()
