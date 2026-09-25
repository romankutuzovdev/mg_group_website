import type { CatalogMake, CatalogRegionSlug } from "@/lib/catalog";
import { MAKES, getMake } from "@/lib/catalog";
import type { AuctionLot } from "@/lib/auctions/types";

const MAKE_ALIASES: Record<string, string> = {
  bmw: "bmw",
  "bmw motorrad": "bmw",
  "mercedes benz": "mercedes-benz",
  "mercedes-benz": "mercedes-benz",
  mercedes: "mercedes-benz",
  "land rover": "land-rover",
  landrover: "land-rover",
  "rolls royce": "rolls-royce",
  "aston martin": "aston-martin",
  gmc: "gmc",
  mini: "mini",
};

const SKIP_MAKES = new Set(["sterling"]);

function spaceKey(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normKey(s: string) {
  return spaceKey(s).replace(/\s+/g, "");
}

function slugify(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Resolve auction make string → catalog make slug (or null). */
export function lotMakeSlug(rawMake: string): string | null {
  const key = spaceKey(rawMake);
  if (!key || SKIP_MAKES.has(normKey(rawMake))) return null;
  if (MAKE_ALIASES[key]) return MAKE_ALIASES[key];
  const compact = normKey(rawMake);
  if (MAKE_ALIASES[compact]) return MAKE_ALIASES[compact];

  const slug = slugify(rawMake);
  if (MAKES[slug]) return slug;

  // Match by catalog make name
  for (const make of Object.values(MAKES)) {
    if (spaceKey(make.name) === key || normKey(make.name) === compact) return make.slug;
  }
  return slug || null;
}

export function lotMatchesMake(lot: AuctionLot, make: CatalogMake): boolean {
  const slug = lotMakeSlug(lot.make);
  return slug === make.slug;
}

export function lotMatchesModel(lot: AuctionLot, make: CatalogMake, modelSlug: string): boolean {
  if (!lotMatchesMake(lot, make)) return false;
  const model = make.models.find((m) => m.slug === modelSlug);
  if (!model) return false;

  const lotModel = spaceKey(lot.model);
  const lotCompact = normKey(lot.model);
  const nameKey = spaceKey(model.name);
  const nameCompact = normKey(model.name);
  const slugCompact = normKey(model.slug);

  if (!lotModel || lotModel === "all models") return false;
  if (lotCompact === nameCompact || lotCompact === slugCompact) return true;
  if (lotModel === nameKey) return true;
  // Prefix: "Camry LE" → Camry, "Tundra Trd" → Tundra
  if (lotCompact.startsWith(nameCompact) || lotCompact.startsWith(slugCompact)) return true;
  if (nameCompact.startsWith(lotCompact) && lotCompact.length >= 3) return true;
  return false;
}

export function filterLotsForMake(
  lots: AuctionLot[],
  make: CatalogMake,
  region?: CatalogRegionSlug,
  limit = 12,
): AuctionLot[] {
  return lots
    .filter((lot) => (!region || lot.region === region) && lotMatchesMake(lot, make))
    .slice(0, limit);
}

export function filterLotsForModel(
  lots: AuctionLot[],
  make: CatalogMake,
  modelSlug: string,
  region?: CatalogRegionSlug,
  limit = 12,
): AuctionLot[] {
  return lots
    .filter(
      (lot) =>
        (!region || lot.region === region) && lotMatchesModel(lot, make, modelSlug),
    )
    .slice(0, limit);
}

/** Count lots per make slug for a region. */
export function countLotsByMake(
  lots: AuctionLot[],
  region: CatalogRegionSlug,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const lot of lots) {
    if (lot.region !== region) continue;
    const slug = lotMakeSlug(lot.make);
    if (!slug) continue;
    counts[slug] = (counts[slug] || 0) + 1;
  }
  return counts;
}

export function countLotsForMake(
  lots: AuctionLot[],
  makeSlug: string,
  region?: CatalogRegionSlug,
): number {
  const make = getMake(makeSlug);
  if (!make) return 0;
  return lots.filter(
    (lot) => (!region || lot.region === region) && lotMatchesMake(lot, make),
  ).length;
}

/** Count lots per model slug within a make. */
export function countLotsByModel(
  lots: AuctionLot[],
  make: CatalogMake,
  region?: CatalogRegionSlug,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const model of make.models) {
    counts[model.slug] = 0;
  }
  for (const lot of lots) {
    if (region && lot.region !== region) continue;
    if (!lotMatchesMake(lot, make)) continue;
    for (const model of make.models) {
      if (lotMatchesModel(lot, make, model.slug)) {
        counts[model.slug] = (counts[model.slug] || 0) + 1;
        break;
      }
    }
  }
  return counts;
}

/** Sort makes: live inventory first (by lot count), then A–Z. */
export function sortMakesByInventory(
  makes: CatalogMake[],
  lotCounts: Record<string, number>,
): CatalogMake[] {
  return [...makes].sort((a, b) => {
    const ca = lotCounts[a.slug] || 0;
    const cb = lotCounts[b.slug] || 0;
    if (ca !== cb) return cb - ca;
    return a.name.localeCompare(b.name, "en");
  });
}

export function countLotsByRegion(lots: AuctionLot[]): Record<CatalogRegionSlug, number> {
  const counts: Record<CatalogRegionSlug, number> = {
    usa: 0,
    china: 0,
    korea: 0,
    uk: 0,
  };
  for (const lot of lots) {
    if (
      lot.region === "usa" ||
      lot.region === "uk" ||
      lot.region === "korea" ||
      lot.region === "china"
    ) {
      counts[lot.region] += 1;
    }
  }
  return counts;
}
