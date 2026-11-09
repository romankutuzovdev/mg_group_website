from __future__ import annotations

import unittest
from unittest import mock

from app.models.cabinet import DealOut, DealSpecs
from app.services import deal_specs_fill as fill


def _deal(**kw) -> DealOut:
    base = dict(
        id=1,
        title="2011 Jeep Grand Cherokee",
        status="active",
        created_at="2026-01-01T00:00:00",
        updated_at="2026-01-01T00:00:00",
        lot_number="45792427",
        lot_url="https://bid.cars/en/lot/1-45792427/2011-Jeep",
    )
    return DealOut(**{**base, **kw})


class DealSpecsFillTest(unittest.TestCase):
    def test_payload_mapping(self):
        specs = fill.specs_from_lot_payload(
            {
                "exteriorColor": "Black",
                "engine": "3.6L V-6 DOHC, VVT, 290HP",
                "odometer": 84200,
                "odometerUnit": "mi",
                "fuel": "—",
                "location": "NJ - Glassboro",
            }
        )
        self.assertEqual(specs.exterior_color, "Black")
        self.assertEqual(specs.engine, "3.6L V-6 DOHC, VVT, 290HP")
        self.assertEqual(specs.odometer, "84200 mi")
        self.assertEqual(specs.fuel, "")
        self.assertEqual(specs.location, "NJ - Glassboro")

    def test_merge_fills_only_empty(self):
        current = DealSpecs(engine="2.0L I4", location="GA")
        incoming = DealSpecs(engine="3.6L V6", exterior_color="Black", location="")
        merged, changed = fill.merge_specs(current, incoming)
        self.assertEqual(merged.engine, "2.0L I4")
        self.assertEqual(merged.exterior_color, "Black")
        self.assertEqual(merged.location, "GA")
        self.assertEqual(changed, ["exterior_color"])

    def test_merge_overwrite(self):
        merged, changed = fill.merge_specs(
            DealSpecs(engine="2.0L I4"), DealSpecs(engine="3.6L V6"), overwrite=True
        )
        self.assertEqual(merged.engine, "3.6L V6")
        self.assertEqual(changed, ["engine"])

    def test_needs_header_specs(self):
        self.assertTrue(fill.needs_header_specs(_deal()))
        self.assertTrue(fill.needs_header_specs(_deal(specs=DealSpecs(engine="x"))))
        self.assertFalse(
            fill.needs_header_specs(_deal(specs=DealSpecs(engine="x", exterior_color="Black")))
        )

    def test_filled_from_catalog_by_url(self):
        payload = {"exteriorColor": "Gray", "engine": "2.4L I4"}
        with mock.patch(
            "app.services.lot_lookup.lookup_in_production_catalog", return_value=payload
        ):
            result = fill.specs_filled_from_catalog(_deal(specs=DealSpecs(engine="old")))
        assert result is not None
        specs, changed = result
        self.assertEqual((specs.exterior_color, specs.engine), ("Gray", "old"))
        self.assertEqual(changed, ["exterior_color"])

    def test_not_found(self):
        with mock.patch(
            "app.services.lot_lookup.lookup_in_production_catalog", return_value=None
        ), mock.patch.object(fill.lot_store, "find_by_lot_number", return_value=None):
            self.assertIsNone(fill.specs_filled_from_catalog(_deal()))


if __name__ == "__main__":
    unittest.main()
