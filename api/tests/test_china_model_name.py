import unittest

from app.scraper.mapper import strip_make_prefix


class StripMakePrefixTests(unittest.TestCase):
    def test_repeated_brand_is_dropped(self):
        self.assertEqual(strip_make_prefix("212", "212 T01"), "T01")
        self.assertEqual(
            strip_make_prefix("Mercedes-benz", "Mercedes-benz Glc New Energy"), "Glc New Energy"
        )

    def test_other_models_are_kept(self):
        self.assertEqual(strip_make_prefix("Bmw", "X5"), "X5")
        self.assertEqual(strip_make_prefix("212", "212"), "212")
        self.assertEqual(strip_make_prefix("Mg", "Mg4"), "Mg4")


if __name__ == "__main__":
    unittest.main()
