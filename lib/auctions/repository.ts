import generated from "@/lib/auctions/generated-lots.json";
import { fetchAllLots, fetchFeaturedLots, fetchLotBySlug, fetchLotSlugs } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import { isAuctionEnded } from "@/lib/auctions/filter-lots";
import { enrichLotSpecs } from "@/lib/auctions/lot-specs";
import type { AuctionLot } from "@/lib/auctions/types";
import { isRealLotPhotoUrl, resolveLotImageUrl } from "@/lib/auctions/lot-image-url";

type GeneratedPayload = {
  lots?: AuctionLot[];
};

/** Only lots with a real photo (Bid.cars CDN or local /auctions/lots/). */
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

function loadGeneratedCatalog(): AuctionLot[] {
  const raw = generated as GeneratedPayload;
  const lots = Array.isArray(raw.lots) ? raw.lots : [];
  return lots.filter(withRealPhoto).filter(stillOnAuction).map(normalizeLot);
}

const GENERATED_LOTS = loadGeneratedCatalog();

/** Drop undefined fields so Next.js getStaticProps can serialize props. */
export function serializeLot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Sync local catalog (JSON). Prefer `loadCatalogLots()` when API is available. */
export function getCatalogLots(): AuctionLot[] {
  return serializeLot(GENERATED_LOTS);
}

/**
 * Catalog for SSG / server: API first, then local JSON fallback.
 */
export async function loadCatalogLots(): Promise<AuctionLot[]> {
  if (isApiEnabled()) {
    try {
      const lots = await fetchAllLots(100);
      if (lots.length > 0) {
        return serializeLot(
          lots.map(normalizeLot).filter(withRealPhoto).filter(stillOnAuction),
        );
      }
    } catch (err) {
      console.warn("[auctions] API catalog unavailable, using local JSON:", err);
    }
  }
  return getCatalogLots();
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
        return serializeLot(lots.map(normalizeLot));
      }
    } catch (err) {
      console.warn("[auctions] API featured unavailable:", err);
    }
  }
  return getFeaturedLiveLots(limit);
}

export function getLotBySlug(slug: string): AuctionLot | undefined {
  const fromGenerated = GENERATED_LOTS.find((l) => l.slug === slug);
  if (!fromGenerated) return undefined;
  return serializeLot(normalizeLot(fromGenerated));
}

export async function loadLotBySlug(slug: string): Promise<AuctionLot | undefined> {
  if (isApiEnabled()) {
    try {
      const lot = await fetchLotBySlug(slug);
      if (lot) return serializeLot(normalizeLot(lot));
    } catch (err) {
      console.warn("[auctions] API lot fetch failed:", err);
    }
  }
  return getLotBySlug(slug);
}

export function getAllSlugs(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const lot of getCatalogLots()) {
    if (!lot.slug || seen.has(lot.slug)) continue;
    seen.add(lot.slug);
    out.push(lot.slug);
  }
  return out;
}

export async function loadAllSlugs(): Promise<string[]> {
  if (isApiEnabled()) {
    try {
      const slugs = await fetchLotSlugs();
      if (slugs.length > 0) return slugs;
    } catch (err) {
      console.warn("[auctions] API slugs unavailable:", err);
    }
  }
  return getAllSlugs();
}

export function hasGeneratedCatalog(): boolean {
  return GENERATED_LOTS.length > 0;
}
