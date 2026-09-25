import { fetchAllLots, fetchFeaturedLots, fetchLotBySlug, fetchLotSlugs } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import { isAuctionEnded } from "@/lib/auctions/filter-lots";
import { enrichLotSpecs } from "@/lib/auctions/lot-specs";
import type { AuctionLot } from "@/lib/auctions/types";
import { isRealLotPhotoUrl, resolveLotImageUrl } from "@/lib/auctions/lot-image-url";

/** Only lots with a real photo (CDN / auction hosts). */
function withRealPhoto(lot: AuctionLot): boolean {
  return isRealLotPhotoUrl(lot.imageUrl);
}

function stillOnAuction(lot: AuctionLot): boolean {
  return !isAuctionEnded(lot);
}

function normalizeLot(lot: AuctionLot): AuctionLot {
  return enrichLotSpecs({
    ...lot,
    imageUrl: resolveLotImageUrl(lot.imageUrl, lot.make),
  });
}

/** Drop undefined fields so Next.js getStaticProps can serialize props. */
export function serializeLot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Live catalog from API only (no generated-lots.json).
 * Filters: real photo + auction not ended.
 */
export async function loadCatalogLots(): Promise<AuctionLot[]> {
  if (!isApiEnabled()) {
    console.warn("[auctions] NEXT_PUBLIC_API_URL is empty — catalog will be empty");
    return [];
  }
  try {
    const lots = await fetchAllLots(100);
    return serializeLot(
      lots.map(normalizeLot).filter(withRealPhoto).filter(stillOnAuction),
    );
  } catch (err) {
    console.warn("[auctions] API catalog unavailable:", err);
    return [];
  }
}

/** @deprecated Sync helper — always empty without local JSON. Prefer loadCatalogLots(). */
export function getCatalogLots(): AuctionLot[] {
  return [];
}

const LIVE_WINDOW_MS = 12 * 60 * 60 * 1000;

function pickLiveLots(lots: AuctionLot[], limit: number): AuctionLot[] {
  const now = Date.now();
  const ranked = [...lots].sort((a, b) => {
    const ta = new Date(a.auctionDate).getTime();
    const tb = new Date(b.auctionDate).getTime();
    const aLive = Number.isFinite(ta) && ta >= now - LIVE_WINDOW_MS;
    const bLive = Number.isFinite(tb) && tb >= now - LIVE_WINDOW_MS;
    if (aLive !== bLive) return aLive ? -1 : 1;
    return Math.abs(ta - now) - Math.abs(tb - now);
  });
  return ranked.slice(0, limit);
}

export function getFeaturedLiveLots(limit = 4): AuctionLot[] {
  return pickLiveLots(getCatalogLots(), limit);
}

export async function loadFeaturedLiveLots(limit = 4): Promise<AuctionLot[]> {
  if (isApiEnabled()) {
    try {
      const lots = await fetchFeaturedLots(limit);
      if (lots.length > 0) {
        return serializeLot(
          lots.map(normalizeLot).filter(withRealPhoto).filter(stillOnAuction),
        );
      }
    } catch (err) {
      console.warn("[auctions] API featured unavailable:", err);
    }
  }
  const all = await loadCatalogLots();
  return pickLiveLots(all, limit);
}

export function getLotBySlug(_slug: string): AuctionLot | undefined {
  return undefined;
}

export async function loadLotBySlug(slug: string): Promise<AuctionLot | undefined> {
  if (!isApiEnabled()) return undefined;
  try {
    const lot = await fetchLotBySlug(slug);
    if (!lot) return undefined;
    const normalized = normalizeLot(lot);
    if (!withRealPhoto(normalized) || !stillOnAuction(normalized)) return undefined;
    return serializeLot(normalized);
  } catch (err) {
    console.warn("[auctions] API lot fetch failed:", err);
    return undefined;
  }
}

export function getAllSlugs(): string[] {
  return [];
}

export async function loadAllSlugs(): Promise<string[]> {
  const { buildSeoInventory } = await import("@/lib/auctions/seo-inventory");
  const inv = await buildSeoInventory();
  return inv.auctionSlugs;
}

export function hasGeneratedCatalog(): boolean {
  return isApiEnabled();
}
