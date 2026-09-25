import type { TitleType, AuctionLot } from "@/lib/auctions/types";
import { resolveLotImageUrl } from "@/lib/auctions/lot-image-url";
import type { CopartUkRawLot } from "./types";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function buildCopartUkSlug(lot: Pick<CopartUkRawLot, "lot_id" | "year" | "make">): string {
  const year = lot.year ?? 0;
  const make = slugify(lot.make ?? "unknown");
  return `copart-uk-${year}-${make}-${lot.lot_id}`;
}

function categoryToTitle(category: string | null | undefined): { titleType: TitleType; titleLabel: string } {
  const cat = (category ?? "").toUpperCase();
  if (cat === "B" || cat === "A") {
    return { titleType: "parts_only", titleLabel: cat === "B" ? "Category B" : "Category A" };
  }
  if (cat === "S") return { titleType: "salvage", titleLabel: "Category S" };
  if (cat === "N") return { titleType: "salvage", titleLabel: "Category N" };
  return { titleType: "salvage", titleLabel: category ? `Category ${category}` : "Salvage" };
}

function parseHasKeys(keys: string | null | undefined): boolean {
  if (!keys) return true;
  const low = keys.toLowerCase();
  return !low.includes("no") && !low.includes("missing");
}

function parseRunsDrives(highlights: string | null | undefined): boolean {
  if (!highlights) return false;
  const low = highlights.toLowerCase();
  return low.includes("run") || low.includes("drive") || low.includes("start");
}

function titleCaseDamage(raw: string | null | undefined, fallback = "Unknown"): string {
  if (!raw) return fallback;
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function mapCopartUkToAuctionLot(raw: CopartUkRawLot, id?: string): AuctionLot {
  const { titleType, titleLabel } = categoryToTitle(raw.category);
  const images = raw.images ?? [];
  const rawPick =
    images.find((u) => u.includes("_ful.") || u.includes("_thb.")) ?? images[0] ?? null;
  const imageUrl = resolveLotImageUrl(rawPick, raw.make);

  const auctionDate = raw.sale_date ?? new Date(Date.now() + 7 * 864e5).toISOString();

  return {
    id: id ?? raw.lot_id,
    slug: buildCopartUkSlug(raw),
    region: "uk",
    source: "copart_uk",
    lotNumber: raw.lot_id,
    vin: raw.vin ?? "—",
    make: raw.make ?? "Unknown",
    model: raw.model ?? raw.title ?? "Unknown",
    year: raw.year ?? 2000,
    titleType,
    titleLabel,
    primaryDamage: titleCaseDamage(raw.primary_damage, "Unknown"),
    secondaryDamage: raw.secondary_damage ? titleCaseDamage(raw.secondary_damage) : undefined,
    odometer: Math.round(raw.odometer ?? 0),
    odometerUnit: "mi",
    currentBid: Math.round(raw.bid ?? 0),
    buyNowPrice: raw.buy_now != null ? Math.round(raw.buy_now) : undefined,
    currency: "GBP",
    location: raw.location ?? "UK",
    auctionDate,
    imageUrl,
    transmission: raw.transmission ?? "—",
    fuel: raw.fuel ?? "—",
    drive: raw.drive ?? "—",
    exteriorColor: raw.color ?? "—",
    hasKeys: parseHasKeys(raw.keys),
    runsDrives: parseRunsDrives(raw.highlights),
    estimatedRetail: raw.estimated_value ?? undefined,
    engine: raw.engine ?? undefined,
    bodyStyle: raw.body_style ?? undefined,
    category: raw.category ?? undefined,
    vatOnSale: raw.vat_on_sale ?? false,
  };
}

export function mapCopartUkToPrisma(raw: CopartUkRawLot) {
  const lot = mapCopartUkToAuctionLot(raw);
  return {
    externalId: raw.lot_id,
    source: "COPART_UK" as const,
    slug: lot.slug,
    vin: lot.vin !== "—" ? lot.vin : null,
    make: lot.make,
    model: lot.model,
    year: lot.year,
    title: raw.title ?? lot.titleLabel,
    damage: lot.primaryDamage,
    secondaryDamage: lot.secondaryDamage ?? null,
    odometer: lot.odometer,
    odometerUnit: lot.odometerUnit,
    currentBid: lot.currentBid,
    buyNowPrice: lot.buyNowPrice ?? null,
    auctionDate: lot.auctionDate ? new Date(lot.auctionDate) : null,
    location: lot.location,
    imageUrl: lot.imageUrl,
    lotUrl: raw.url ?? `https://www.copart.co.uk/lot/${raw.lot_id}`,
    region: lot.region,
    currency: lot.currency,
    titleType: lot.titleType,
    titleLabel: lot.titleLabel,
    transmission: lot.transmission,
    fuel: lot.fuel,
    drive: lot.drive,
    exteriorColor: lot.exteriorColor,
    hasKeys: lot.hasKeys,
    runsDrives: lot.runsDrives,
    estimatedRetail: lot.estimatedRetail ?? null,
    engine: lot.engine ?? null,
    bodyStyle: lot.bodyStyle ?? null,
    category: lot.category ?? null,
    vatOnSale: lot.vatOnSale ?? false,
    imageUrls: raw.images?.length ? raw.images : undefined,
    rawData: raw as object,
    status: "ACTIVE" as const,
  };
}
