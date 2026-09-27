import { fetchLotMeta, fetchLotsPage, fetchFeaturedLots } from "@/lib/api/client";
import type { AuctionLot } from "@/lib/auctions/types";
import type { CatalogRegionSlug } from "@/lib/catalog";

/** Lightweight SSG helpers — never call fetchAllLots / loadCatalogLots here. */

/** Normalize region counts; backfill korea from encar if API meta is stale. */
export function normalizeRegionCounts(meta: {
  counts_by_region?: Partial<Record<string, number>>;
  counts_by_source?: Partial<Record<string, number>>;
}): Partial<Record<CatalogRegionSlug, number>> {
  const c: Partial<Record<CatalogRegionSlug, number>> = {
    ...(meta.counts_by_region as Partial<Record<CatalogRegionSlug, number>>),
  };
  // Stale Windows API (pre-korea keys): encar lots exist but korea count missing/0
  const encar = meta.counts_by_source?.encar ?? 0;
  if ((c.korea == null || c.korea === 0) && encar > 0) {
    c.korea = encar;
  }
  return c;
}

export async function loadRegionCountsLite(): Promise<
  Partial<Record<CatalogRegionSlug, number>>
> {
  try {
    const meta = await fetchLotMeta();
    return normalizeRegionCounts(meta);
  } catch {
    return {};
  }
}

/** First page only — seed for catalog UI; client loads the rest via API. */
export async function loadLotsPageLite(opts?: {
  region?: string;
  make?: string;
  model?: string;
  pageSize?: number;
}): Promise<{ lots: AuctionLot[]; total: number }> {
  try {
    const res = await fetchLotsPage({
      region: opts?.region,
      make: opts?.make,
      model: opts?.model,
      page: 1,
      pageSize: opts?.pageSize ?? 12,
      sort: "date",
      order: "desc",
    });
    return { lots: res.items || [], total: res.total || 0 };
  } catch {
    return { lots: [], total: 0 };
  }
}

export async function loadFeaturedLite(limit = 4): Promise<AuctionLot[]> {
  try {
    return await fetchFeaturedLots(limit);
  } catch {
    return [];
  }
}
