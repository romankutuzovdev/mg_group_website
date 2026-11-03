from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services import lot_photos, r2_photos
from app.services.lots_sync import _rewrite_local_to_cdn


class _PrefixClient:
    def list_objects_v2(self, **kwargs):
        self.kwargs = kwargs
        return {
            "CommonPrefixes": [
                {"Prefix": "lots/live-lot/"},
                {"Prefix": "lots/ended-lot/"},
            ],
            "IsTruncated": False,
        }


class R2PhotoTests(unittest.TestCase):
    def test_catalog_export_does_not_invent_unconfirmed_r2_urls(self):
        lot = {
            "imageUrl": "/api/lot-photos/lot-1/01.jpg",
            "imageUrls": [
                "/api/lot-photos/lot-1/01.jpg",
                "https://source.example/01.jpg",
            ],
        }
        exported = _rewrite_local_to_cdn(lot)
        self.assertEqual(exported["imageUrl"], "https://source.example/01.jpg")
        self.assertEqual(exported["imageUrls"], ["https://source.example/01.jpg"])
        self.assertNotIn("r2", exported["imageUrl"])

    def test_archive_reconcile_never_deletes_when_catalog_is_empty(self):
        with patch.object(lot_photos, "sweep_orphan_photos") as local_sweep:
            self.assertEqual(
                lot_photos.reconcile_photo_archives(set()),
                {"local_folders": 0, "r2_prefixes": 0, "r2_objects": 0},
            )
            local_sweep.assert_not_called()

    def test_orphan_sweep_never_deletes_when_catalog_is_empty(self):
        with (
            patch.object(r2_photos, "r2_enabled", return_value=True),
            patch.object(r2_photos, "_client") as client,
        ):
            self.assertEqual(
                r2_photos.sweep_orphan_r2(set()),
                {"prefixes": 0, "objects": 0},
            )
            client.assert_not_called()

    def test_orphan_sweep_deletes_only_missing_lot_prefixes(self):
        deleted: list[str] = []
        client = _PrefixClient()
        with (
            patch.object(r2_photos, "r2_enabled", return_value=True),
            patch.object(r2_photos, "_client", return_value=client),
            patch.object(
                r2_photos,
                "get_settings",
                return_value=SimpleNamespace(r2_bucket="photos"),
            ),
            patch.object(
                r2_photos,
                "delete_lot_prefix",
                side_effect=lambda lot_id: deleted.append(lot_id) or 3,
            ),
        ):
            stats = r2_photos.sweep_orphan_r2({"live-lot"})

        self.assertEqual(deleted, ["ended-lot"])
        self.assertEqual(stats, {"prefixes": 1, "objects": 3})
        self.assertEqual(client.kwargs["Prefix"], "lots/")
        self.assertEqual(client.kwargs["Delimiter"], "/")

    def test_partial_upload_does_not_publish_broken_cdn_thumbnail(self):
        local = "/api/lot-photos/lot-1/01-deadbeef.jpg"
        cdn = "https://img.example/lots/lot-1/01-deadbeef.jpg"
        common = (
            patch.object(r2_photos, "r2_enabled", return_value=True),
            patch.object(r2_photos, "region_uses_cdn", return_value=True),
            patch.object(r2_photos, "local_api_to_cdn_url", return_value=cdn),
        )
        with common[0], common[1], common[2], patch.object(
            r2_photos, "upload_lot_dir", return_value={"01-deadbeef.jpg"}
        ):
            self.assertEqual(r2_photos.promote_gallery_urls("lot-1", [local]), [local])

        with (
            patch.object(r2_photos, "r2_enabled", return_value=True),
            patch.object(r2_photos, "region_uses_cdn", return_value=True),
            patch.object(r2_photos, "local_api_to_cdn_url", return_value=cdn),
            patch.object(
                r2_photos,
                "upload_lot_dir",
                return_value={"01-deadbeef.jpg", "01-deadbeef-th.jpg"},
            ),
        ):
            self.assertEqual(r2_photos.promote_gallery_urls("lot-1", [local]), [cdn])


if __name__ == "__main__":
    unittest.main()
