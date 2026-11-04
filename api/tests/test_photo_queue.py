from __future__ import annotations

import unittest
from unittest.mock import patch

from app.models.lots import AuctionLot
from app.scraper import photo_enricher
from app.scraper.photo_enricher import PhotoEnrichmentAgent


def _lot(lot_id: str, *, bid: float, sold: bool = False) -> AuctionLot:
    return AuctionLot(
        id=lot_id, slug=lot_id, region="usa", source="bidcars", lotNumber=lot_id,
        make="Ford", model="Mustang", year=2020, currentBid=bid, sold=sold,
        lotUrl=f"https://bid.cars/en/lot/{lot_id}",
        imageUrl="https://pluto.bid.car/1/a-1.jpg",
        imageUrls=[f"https://pluto.bid.car/1/a-{i}.jpg" for i in range(1, 6)],
    )


class PhotoQueueTests(unittest.TestCase):
    def test_sold_lots_are_not_queued_even_with_highest_bid(self):
        lots = [_lot("sold", bid=90000, sold=True), _lot("live", bid=500)]
        with patch.object(photo_enricher.lot_store, "all", return_value=lots):
            queue = PhotoEnrichmentAgent()._queue()
        self.assertEqual([lot.id for lot in queue], ["live"])


if __name__ == "__main__":
    unittest.main()
