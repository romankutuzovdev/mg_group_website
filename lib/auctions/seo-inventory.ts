/**
 * SEO inventory from live auction lots (API / build cache).
 * Make/model paths with live stock → Next SSG.
 * Auction lot URLs → sitemap + Cloudflare Function (not Next SSG by default).
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

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * How many `/auctions/[slug]` pages Next statically exports.
 * Default 0 — lot HTML is served by Cloudflare Pages Function (fast builds).
 */
export function getAuctionSsgLimit(): number {
  return envInt("SEO_AUCTION_SSG_LIMIT", 0);
}

/** Cap for auction URLs in sitemap (Function still serves any live slug). */
export function getAuctionSitemapLimit(): number {
  return envInt("SEO_AUCTION_SITEMAP_LIMIT", 5000);
}

export type SeoMakePath = { region: CatalogRegionSlug; make: string };
export type SeoModelPath = { region: CatalogRegionSlug; make: string; model: string };

export type SeoInventory = {
  lots: AuctionLot[];
  makePaths: SeoMakePath[];
  modelPaths: SeoModelPath[];
  /** Slugs for sitemap / edge SEO (not necessarily SSG). */
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

let inventoryMemo: Promise<SeoInventory> | null = null;

export async function buildSeoInventory(): Promise<SeoInventory> {
  if (!inventoryMemo) {
    inventoryMemo = buildSeoInventoryUncached();
  }
  return inventoryMemo;
}

async function buildSeoInventoryUncached(): Promise<SeoInventory> {
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

  const ranked = [...lots].sort((a, b) => {
    const ta = Date.parse(a.auctionDate || "") || Number.MAX_SAFE_INTEGER;
    const tb = Date.parse(b.auctionDate || "") || Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });

  const sitemapLimit = getAuctionSitemapLimit();
  const seen = new Set<string>();
  const auctionSlugs: string[] = [];
  for (const lot of ranked) {
    if (!lot.slug || seen.has(lot.slug)) continue;
    seen.add(lot.slug);
    auctionSlugs.push(lot.slug);
    if (auctionSlugs.length >= sitemapLimit) break;
  }

  return { lots, makePaths, modelPaths, auctionSlugs };
}
