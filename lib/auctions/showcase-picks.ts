import type { AuctionLot } from "@/lib/auctions/types";

export function pickShowcaseLots(lots: AuctionLot[], limit = 6): AuctionLot[] {
  const picked: AuctionLot[] = [];
  const makes = new Set<string>();
  // Bid.cars lots have no bids until auction day, only an estimated cost.
  const eligible = lots.filter(
    (lot) => lot.imageUrl && (lot.currentBid > 0 || (lot.estimatedCostMin ?? 0) > 0),
  );
  for (const lot of eligible) {
    const make = lot.make.toLowerCase();
    if (makes.has(make)) continue;
    makes.add(make);
    picked.push(lot);
    if (picked.length === limit) return picked;
  }
  for (const lot of eligible) {
    if (picked.some((item) => item.id === lot.id)) continue;
    picked.push(lot);
    if (picked.length === limit) break;
  }
  return picked;
}
