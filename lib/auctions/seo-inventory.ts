/**
 * SEO inventory from live auction lots (API).
 * Only region/make/model paths that have active lots with photos get SSG + sitemap.
 */
import { loadCatalogLots } from "@/lib/auctions/repository";
import type { AuctionLot } from "@/lib/auctions/types";
import {
  REGION_ORDER,
  getMake,
  getMakesForRegion,
  type CatalogRegionSlug,
} from "@/lib/catalog";
import { lotMakeSlug, lotMatchesModel } from "@/lib/catalog/match-lots";

/** Soft cap so daily Cloudflare builds stay reasonable while indexing fresh stock. */
export const SEO_AUCTION_SLUG_LIMIT = 2000;

export type SeoMakePath = { region: CatalogRegionSlug; make: string };
export type SeoModelPath = { region: CatalogRegionSlug; make: string; model: string };

export type SeoInventory = {
  lots: AuctionLot[];
  makePaths: SeoMakePath[];
  modelPaths: SeoModelPath[];
  auctionSlugs: string[];
};

function lotModelSlug(lot: AuctionLot, makeSlug: string): string | null {
  const make = getMake(makeSlug);
  if (!make) return null;
  for (const model of make.models) {
    if (lotMatchesModel(lot, make, model.slug)) return model.slug;
  }
  return null;
}

export async function buildSeoInventory(): Promise<SeoInventory> {
  const lots = await loadCatalogLots();

  const makeKeys = new Set<string>();
  const modelKeys = new Set<string>();

  for (const lot of lots) {
    const region = lot.region as CatalogRegionSlug;
    if (!REGION_ORDER.includes(region)) continue;
    const makeSlug = lotMakeSlug(lot.make);
    if (!makeSlug || !getMake(makeSlug)) continue;
    if (!getMakesForRegion(region).some((m) => m.slug === makeSlug)) continue;

    makeKeys.add(`${region}::${makeSlug}`);
    const modelSlug = lotModelSlug(lot, makeSlug);
    if (modelSlug) modelKeys.add(`${region}::${makeSlug}::${modelSlug}`);
  }

  const makePaths: SeoMakePath[] = [...makeKeys]
    .map((k) => {
      const [region, make] = k.split("::") as [CatalogRegionSlug, string];
      return { region, make };
    })
    .sort((a, b) => a.region.localeCompare(b.region) || a.make.localeCompare(b.make));

  const modelPaths: SeoModelPath[] = [...modelKeys]
    .map((k) => {
      const [region, make, model] = k.split("::") as [CatalogRegionSlug, string, string];
      return { region, make, model };
    })
    .sort(
      (a, b) =>
        a.region.localeCompare(b.region) ||
        a.make.localeCompare(b.make) ||
        a.model.localeCompare(b.model),
    );

  // Prefer soonest auctions for indexing budget
  const ranked = [...lots].sort((a, b) => {
    const ta = Date.parse(a.auctionDate || "") || Number.MAX_SAFE_INTEGER;
    const tb = Date.parse(b.auctionDate || "") || Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });

  const seen = new Set<string>();
  const auctionSlugs: string[] = [];
  for (const lot of ranked) {
    if (!lot.slug || seen.has(lot.slug)) continue;
    seen.add(lot.slug);
    auctionSlugs.push(lot.slug);
    if (auctionSlugs.length >= SEO_AUCTION_SLUG_LIMIT) break;
  }

  return { lots, makePaths, modelPaths, auctionSlugs };
}
