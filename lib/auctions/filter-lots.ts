import type { AuctionLot, AuctionRegion, AuctionSource, CatalogFilters, CatalogQuickTab } from "./types";

function parseNum(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function getOne(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = params[key];
  if (typeof v === "string" && v) return v;
  if (Array.isArray(v)) return v.find((item) => item);
  return undefined;
}

function getAll(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string[] {
  const v = params[key];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "string" && v) return [v];
  return [];
}

const AUCTION_SOURCES: AuctionSource[] = [
  "copart",
  "iaai",
  "copart_uk",
  "manheim",
  "salvage_market",
  "encar",
  "china_market",
];
const TABS: CatalogQuickTab[] = ["all", "passable", "open", "buy-now"];

export function parseCatalogFilters(
  params: Record<string, string | string[] | undefined>,
): CatalogFilters {
  const auctions = getAll(params, "auction").filter((item): item is AuctionSource =>
    AUCTION_SOURCES.includes(item as AuctionSource),
  );
  const tabRaw = getOne(params, "tab");
  const tab = TABS.includes(tabRaw as CatalogQuickTab)
    ? (tabRaw as CatalogQuickTab)
    : "all";

  return {
    q: getOne(params, "q"),
    make: getOne(params, "make"),
    model: getOne(params, "model"),
    yearFrom: parseNum(getOne(params, "yearFrom") ?? getOne(params, "yearMin")),
    yearTo: parseNum(getOne(params, "yearTo") ?? getOne(params, "yearMax")),
    auctions,
    priceMin: parseNum(getOne(params, "priceMin")),
    priceMax: parseNum(getOne(params, "priceMax")),
    body: getOne(params, "body"),
    damage: getOne(params, "damage") ?? getOne(params, "dmg1"),
    drive: getOne(params, "drive"),
    trans: getOne(params, "trans"),
    fuel: getOne(params, "fuel"),
    mileageMax: parseNum(getOne(params, "mileageMax")),
    engMin: parseNum(getOne(params, "engMin")),
    engMax: parseNum(getOne(params, "engMax")),
    run: getOne(params, "run") === "1",
    buynow: getOne(params, "buynow") === "1",
    arch: getOne(params, "arch") === "1",
    tab,
  };
}

function matchesQuery(lot: AuctionLot, q?: string): boolean {
  if (!q) return true;
  const hay = `${lot.make} ${lot.model} ${lot.vin} ${lot.lotNumber} ${lot.year}`.toLowerCase();
  return hay.includes(q.trim().toLowerCase());
}

function includesNorm(hay: string | undefined | null, needle: string): boolean {
  if (!hay) return false;
  return hay.toLowerCase().includes(needle.trim().toLowerCase());
}

function matchesFuel(lot: AuctionLot, fuel?: string): boolean {
  if (!fuel) return true;
  const want = fuel.trim().toLowerCase();
  const hay = (lot.fuel || "").trim().toLowerCase();
  if (!hay || hay === "—") return false;
  if (want === hay) return true;
  if (want === "gasoline" || want === "petrol" || want === "бензин") {
    return /gasoline|petrol|бензин/.test(hay);
  }
  if (want === "diesel" || want === "дизель") return /diesel|дизел/.test(hay);
  if (want === "hybrid" || want === "гибрид") return /hybrid|гибрид/.test(hay);
  if (want === "electric" || want === "электро") return /electric|электро|^ev$/.test(hay);
  if (want === "gas" || want === "газ") {
    return (/lpg|cng|\bgas\b|газ/.test(hay) || hay === "gas") && !/gasoline|petrol/.test(hay);
  }
  return hay.includes(want);
}

function matchesDrive(lot: AuctionLot, drive?: string): boolean {
  if (!drive) return true;
  const want = drive.trim().toLowerCase();
  const hay = (lot.drive || "").trim().toLowerCase();
  if (!hay || hay === "—") return false;
  if (want === hay) return true;
  if (want === "fwd") return /fwd|перед|front|2 wheel/.test(hay);
  if (want === "rwd") return /rwd|зад|rear/.test(hay);
  if (want === "awd") return /awd|full|полн/.test(hay);
  if (want === "4x4") return /4x4|4wd|квадро/.test(hay);
  return hay.includes(want);
}

function matchesTrans(lot: AuctionLot, trans?: string): boolean {
  if (!trans) return true;
  const want = trans.trim().toLowerCase();
  const hay = (lot.transmission || "").trim().toLowerCase();
  if (!hay || hay === "—") return false;
  if (want === hay) return true;
  if (want === "automatic" || want === "автомат") return /auto|авт|s-auto|semi/.test(hay);
  if (want === "manual" || want === "механика") return /manual|мех|мкпп/.test(hay);
  if (want === "cvt") return /cvt|вариатор/.test(hay);
  return hay.includes(want);
}

/** Parse engine liters from engine / bodyStyle / model text (e.g. 3.0L, 1368 cc). */
export function lotEngineLiters(lot: AuctionLot): number | null {
  const hay = [lot.engine, lot.bodyStyle, lot.model].filter(Boolean).join(" ");
  const liters = hay.match(/(\d(?:[.,]\d)?)\s*l\b/i) || hay.match(/\b(\d(?:[.,]\d)?)\s*л\b/i);
  if (liters) {
    const n = Number(String(liters[1]).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const cc = hay.match(/(\d{3,4})\s*cc\b/i);
  if (cc) {
    const n = Number(cc[1]) / 1000;
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  }
  return null;
}

function lotOdometerMiles(lot: AuctionLot): number {
  if (lot.odometerUnit === "km") return Math.round(lot.odometer / 1.60934);
  return lot.odometer;
}

function matchesTab(lot: AuctionLot, tab: CatalogQuickTab): boolean {
  if (tab === "all") return true;
  if (tab === "buy-now") return lot.buyNowPrice != null && lot.buyNowPrice > 0;
  if (tab === "passable") return lot.runsDrives;
  if (tab === "open") return lot.titleType === "clean";
  return true;
}

export function isAuctionEnded(lot: AuctionLot, graceHours = 3): boolean {
  const raw = (lot.auctionDate || "").trim();
  if (!raw) return false;
  const ms = Date.parse(raw.length === 10 ? `${raw}T23:59:59Z` : raw);
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now() - graceHours * 3600_000;
}

export function filterLots(lots: AuctionLot[], filters: CatalogFilters): AuctionLot[] {
  return lots.filter((lot) => {
    if (!filters.arch && isAuctionEnded(lot)) return false;
    if (!matchesQuery(lot, filters.q)) return false;
    if (filters.make && lot.make.trim().toLowerCase() !== filters.make.trim().toLowerCase()) {
      return false;
    }
    if (filters.model && !includesNorm(lot.model, filters.model)) return false;
    if (filters.auctions.length && !filters.auctions.includes(lot.source)) return false;
    if (filters.region && lot.region !== filters.region) return false;
    if (!matchesTab(lot, filters.tab)) return false;
    if (filters.yearFrom != null && lot.year < filters.yearFrom) return false;
    if (filters.yearTo != null && lot.year > filters.yearTo) return false;
    if (filters.priceMin != null && lot.currentBid < filters.priceMin) return false;
    if (filters.priceMax != null && lot.currentBid > filters.priceMax) return false;
    if (filters.mileageMax != null && lotOdometerMiles(lot) > filters.mileageMax) return false;
    if (
      filters.body &&
      !includesNorm(lot.bodyStyle, filters.body) &&
      !includesNorm(lot.model, filters.body)
    ) {
      return false;
    }
    if (
      filters.damage &&
      !includesNorm(lot.primaryDamage, filters.damage) &&
      !includesNorm(lot.secondaryDamage, filters.damage)
    ) {
      return false;
    }
    if (!matchesFuel(lot, filters.fuel)) return false;
    if (!matchesDrive(lot, filters.drive)) return false;
    if (!matchesTrans(lot, filters.trans)) return false;
    if (filters.engMin != null || filters.engMax != null) {
      const liters = lotEngineLiters(lot);
      if (liters == null) return false;
      if (filters.engMin != null && liters < filters.engMin) return false;
      if (filters.engMax != null && liters > filters.engMax) return false;
    }
    if (filters.run && !lot.runsDrives) return false;
    if (filters.buynow && !(lot.buyNowPrice != null && lot.buyNowPrice > 0)) return false;
    return true;
  });
}

export function uniqueSorted(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((v) => (v || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
}

export function countByRegion(lots: AuctionLot[]) {
  return {
    usa: lots.filter((l) => l.region === "usa").length,
    korea: lots.filter((l) => l.region === "korea").length,
    china: lots.filter((l) => l.region === "china").length,
    uk: lots.filter((l) => l.region === "uk").length,
  };
}
