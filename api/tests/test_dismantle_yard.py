import sqlite3
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest import mock

from openpyxl import load_workbook

from app.models.cabinet import DealCreate, DealUpdate, DismantleCellPatch, DismantleMetaPatch
from app.services import dismantle_map_template as tpl
from app.services.cabinet_store import CabinetStore
from app.services.dismantle_xlsx import build_dismantle_xlsx


class DismantleYardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.store = CabinetStore()
        self.store._path = lambda: root / "cabinet.db"
        self.store._uploads = lambda: root / "uploads"
        self.store.init()
        with sqlite3.connect(root / "cabinet.db") as conn:
            conn.execute(
                "INSERT INTO users (telegram_id, created_at) VALUES (1, '2026-01-01T00:00:00')"
            )

    def tearDown(self):
        self.tmp.cleanup()

    def deal(self, **kw):
        base = dict(telegram_id=1, title="2019 Audi RS3", vin="WUA1", lot_number="66731706")
        return self.store.create_deal(DealCreate(**{**base, **kw}))

    def test_new_jersey_form(self):
        out = self.store.get_dismantle_map(self.deal(dismantle_yard="new_jersey").id)
        self.assertEqual(out.variant, "usa_nj")
        self.assertEqual(len(out.cells), 92)
        self.assertEqual(out.cells[0].name, "Фара")
        self.assertEqual(out.cells[0].qty, "")
        self.assertEqual(out.cells[-1].section, "Дополнительные поля / Extra")

    def test_deal_without_yard_keeps_old_form(self):
        deal = self.deal()
        self.store.patch_dismantle_cell(deal.id, "usa_1", DismantleCellPatch(qty="2"))
        out = self.store.get_dismantle_map(deal.id)
        self.assertEqual(out.variant, "usa")
        self.assertEqual(len(out.cells), 194)
        self.assertEqual(out.cells[0].qty, "2")

    def test_texas_form(self):
        out = self.store.get_dismantle_map(self.deal(dismantle_yard="texas").id)
        self.assertEqual(out.variant, "usa_tx")
        self.assertEqual(len(out.cells), 194)
        self.assertEqual(out.qty_choices, ["да", "нет", "все"])
        self.assertEqual(out.cells[0].name_en, "1. Main Wiring (engine-CPU)")
        self.assertTrue(all(c.qty == "" and c.note == "" for c in out.cells))

    def test_old_deal_keeps_cells_when_moved_to_texas(self):
        deal = self.deal()
        self.store.patch_dismantle_cell(deal.id, "usa_1", DismantleCellPatch(qty="2", note="целая"))
        self.store.update_deal(deal.id, DealUpdate(dismantle_yard="texas"))
        cell = self.store.get_dismantle_map(deal.id).cells[0]
        self.assertEqual((cell.qty, cell.note), ("2", "целая"))

    def test_missing_yard_form_falls_back_to_old_form(self):
        with mock.patch.dict(tpl._PATHS, {"usa_tx": Path("/nonexistent.json")}):
            self.assertEqual(tpl.map_variant_for_deal("usa", "texas"), "usa")

    def test_texas_excel_matches_yard_file(self):
        deal = self.deal(dismantle_yard="texas")
        self.store.patch_dismantle_cell(deal.id, "usa_1", DismantleCellPatch(qty="да"))
        ws = load_workbook(BytesIO(build_dismantle_xlsx(self.store.get_dismantle_map(deal.id)))).active
        self.assertEqual((ws["A1"].value, ws["B1"].value), ("LOT:", "66731706"))
        self.assertEqual([ws.cell(12, c).value for c in range(1, 6)][2:], ["Save", "Примечания | Notes", "Снято"])
        self.assertEqual(ws["A13"].value, "0. Проводка")
        self.assertEqual(ws["C14"].value, "да")
        self.assertEqual(ws.cell(ws.max_row, 1).value, "*** Конец карты")

    def test_uk_ignores_yard(self):
        deal = self.deal(origin_region="uk", dismantle_yard="new_jersey")
        self.assertEqual(deal.dismantle_yard, "")
        self.assertEqual(self.store.get_dismantle_map(deal.id).variant, "uk")

    def test_switching_yard_keeps_filled_cells(self):
        deal = self.deal(dismantle_yard="new_jersey")
        self.store.patch_dismantle_cell(deal.id, "nj_1", DismantleCellPatch(qty="2"))
        self.store.update_deal(deal.id, DealUpdate(dismantle_yard="texas"))
        self.store.update_deal(deal.id, DealUpdate(dismantle_yard="new_jersey"))
        self.assertEqual(self.store.get_dismantle_map(deal.id).cells[0].qty, "2")

    def test_completed_map_blocks_yard_change(self):
        deal = self.deal(dismantle_yard="new_jersey")
        self.store.patch_dismantle_meta(deal.id, DismantleMetaPatch(completed=True))
        with self.assertRaises(ValueError):
            self.store.update_deal(deal.id, DealUpdate(dismantle_yard="texas"))

    def test_new_jersey_excel_matches_blank(self):
        deal = self.deal(dismantle_yard="new_jersey")
        self.store.patch_dismantle_cell(deal.id, "nj_1", DismantleCellPatch(qty="2", note="целая"))
        ws = load_workbook(BytesIO(build_dismantle_xlsx(self.store.get_dismantle_map(deal.id)))).active
        self.assertIn("66731706", ws["A1"].value)
        self.assertEqual(ws["C2"].value, "Order")
        self.assertEqual(ws["D2"].value, "Done")
        self.assertEqual(ws["A3"].value, "Оптика")
        self.assertEqual(
            [ws.cell(4, c).value for c in range(1, 6)], [1, "Фара", "2", None, "целая"]
        )


if __name__ == "__main__":
    unittest.main()
