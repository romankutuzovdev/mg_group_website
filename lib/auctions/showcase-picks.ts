import type { AuctionLot } from "@/lib/auctions/types";

// Models we don't want on the homepage showcase ("make model", lowercase).
const HIDDEN_SHOWCASE_MODELS = new Set(["nissan pathfinder"]);

function isHiddenFromShowcase(lot: AuctionLot): boolean {
  const make = (lot.make ?? "").trim().toLowerCase();
  const model = (lot.model ?? "").trim().toLowerCase();
  // model can carry a trim suffix ("pathfinder platinum"), so match by prefix
  return Array.from(HIDDEN_SHOWCASE_MODELS).some((name) =>
    `${make} ${model}`.startsWith(name),
  );
}

export function pickShowcaseLots(lots: AuctionLot[], limit = 6): AuctionLot[] {
  const picked: AuctionLot[] = [];
  const makes = new Set<string>();
  // Bid.cars lots have no bids until auction day, only an estimated cost.
  const eligible = lots.filter(
    (lot) =>
      lot.imageUrl &&
      (lot.currentBid > 0 || (lot.estimatedCostMin ?? 0) > 0) &&
      !isHiddenFromShowcase(lot),
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
