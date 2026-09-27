import type { AuctionLot } from "@/lib/auctions/types";

/** IAA search row dumped into one field instead of separate specs. */
const LISTING_BLOB = /stock\s*#:|view all images|view sale list|pre-?bid or buy now/i;

const TITLE_DOCS = [
  "non-repairable",
  "certificate of destruction",
  "cert of destruction",
  "bill of sale",
  "salvage",
  "rebuilt",
  "clear",
  "clean",
  "junk",
];

export function isListingBlob(value: string | null | undefined): boolean {
  const text = (value || "").trim();
  return text.length > 70 && LISTING_BLOB.test(text);
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export type ParsedListing = {
  year?: number;
  make?: string;
  model?: string;
  lotNumber?: string;
  titleLabel?: string;
  primaryDamage?: string;
  odometer?: number;
  vin?: string;
  location?: string;
  engine?: string;
  fuel?: string;
  hasKeys?: boolean;
  runsDrives?: boolean;
};

export function parseListingBlob(text: string): ParsedListing {
  const raw = text.replace(/\s+/g, " ").trim();
  const out: ParsedListing = {};

  const title = raw.match(
    /\b((?:19|20)\d{2})\s+([A-Za-z0-9][A-Za-z0-9-]{1,24})\s+(.+?)\s+Stock\s*#:/i,
  );
  if (title) {
    out.year = Number(title[1]);
    out.make = titleCase(title[2]);
    out.model = titleCase(title[3]);
  }

  const stock = raw.match(/Stock\s*#:\s*(\d+)/i);
  if (stock) out.lotNumber = stock[1];

  const mid = raw.match(/Stock\s*#:\s*\d+\s+(.+?)\s+([\d,]+)\s*mi\b/i);
  if (mid) {
    let chunk = mid[1].trim();
    const low = chunk.toLowerCase();
    const doc = TITLE_DOCS.find((item) => low.startsWith(item));
    if (doc) {
      out.titleLabel = titleCase(doc);
      chunk = chunk.slice(doc.length).trim();
    }
    if (chunk) out.primaryDamage = titleCase(chunk);
    out.odometer = Number(mid[2].replace(/,/g, ""));
  }

  const vin = raw.match(/VIN:\s*([A-HJ-NPR-Z0-9*]{11,17})(?![A-HJ-NPR-Z0-9*])/i);
  if (vin) out.vin = vin[1];

  const loc = raw.match(
    /\b([A-Za-z][A-Za-z0-9 .'/]{1,40}?)\s*\(\s*([A-Za-z][A-Za-z .]{1,24})\s*\)/,
  );
  if (loc) {
    const city = loc[1].trim();
    const state = loc[2].trim();
    if (!/^(mi|km|usd|vin)$/i.test(city) && !/^(actual|exempt)$/i.test(state)) {
      const stateFmt = state.length <= 3 && !state.includes(" ") ? state.toUpperCase() : titleCase(state);
      out.location = `${titleCase(city)} (${stateFmt})`;
    }
  }

  const engine = raw.match(
    /(\d+(?:\.\d+)?\s*l\s+.+?)(?=\s+(?:Gasoline|Diesel|Hybrid|Electric|Flex)\b)/i,
  );
  if (engine) out.engine = engine[1].replace(/\s+/g, " ").trim();

  const fuel = raw.match(/\b(Gasoline|Diesel|Hybrid|Electric|Flex(?:\s*Fuel)?)\b/i);
  if (fuel) out.fuel = titleCase(fuel[1]);

  if (/key available|keys?\s*:\s*present/i.test(raw)) out.hasKeys = true;
  if (/run\s*&\s*drive|runs?\s+and\s+drive/i.test(raw)) out.runsDrives = true;

  return out;
}

function blobText(lot: Pick<AuctionLot, "primaryDamage" | "model" | "make" | "location" | "engine" | "titleLabel">): string {
  return (
    [lot.primaryDamage, lot.model, lot.make, lot.location, lot.engine, lot.titleLabel].find((value) =>
      isListingBlob(value),
    ) || ""
  );
}

function dirty(value: string | null | undefined): boolean {
  const text = (value || "").trim();
  if (!text || text === "—" || text === "Unknown" || text === "USA") return true;
  return isListingBlob(text);
}

/** Replace a dumped IAA search row with separate make, damage, mileage and location. */
export function presentLot<T extends AuctionLot>(lot: T): T {
  const source = blobText(lot);
  if (!source) return lot;
  const parsed = parseListingBlob(source);
  return {
    ...lot,
    year: parsed.year || lot.year,
    make: dirty(lot.make) && parsed.make ? parsed.make : lot.make,
    model: dirty(lot.model) && parsed.model ? parsed.model : lot.model,
    lotNumber: dirty(lot.lotNumber) && parsed.lotNumber ? parsed.lotNumber : lot.lotNumber,
    titleLabel: dirty(lot.titleLabel) && parsed.titleLabel ? parsed.titleLabel : lot.titleLabel,
    primaryDamage: dirty(lot.primaryDamage) && parsed.primaryDamage ? parsed.primaryDamage : lot.primaryDamage,
    odometer: !lot.odometer && parsed.odometer ? parsed.odometer : lot.odometer,
    vin: dirty(lot.vin) && parsed.vin ? parsed.vin : lot.vin,
    location: dirty(lot.location) && parsed.location ? parsed.location : lot.location,
    engine: dirty(lot.engine) && parsed.engine ? parsed.engine : lot.engine,
    fuel: dirty(lot.fuel) && parsed.fuel ? parsed.fuel : lot.fuel,
    hasKeys: lot.hasKeys || Boolean(parsed.hasKeys),
    runsDrives: lot.runsDrives || Boolean(parsed.runsDrives),
  };
}

/** Short damage label. Listing dumps never become a chip. */
export function displayDamage(value: string | null | undefined): string {
  const text = (value || "").trim();
  if (!text || text === "Unknown" || text === "—") return "";
  if (isListingBlob(text)) return parseListingBlob(text).primaryDamage || "";
  if (text.length > 48) return "";
  return text;
}
