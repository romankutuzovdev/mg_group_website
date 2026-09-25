import type { AuctionLot } from "@/lib/auctions/types";

const EMPTY = new Set(["", "—", "-", "na", "n/a", "unknown", "null", "undefined"]);

function blank(value: string | undefined | null): boolean {
  return !value || EMPTY.has(String(value).trim().toLowerCase());
}

function blobOf(lot: Pick<AuctionLot, "make" | "model" | "engine" | "bodyStyle" | "fuel" | "drive" | "transmission">) {
  return [lot.make, lot.model, lot.engine, lot.bodyStyle, lot.fuel, lot.drive, lot.transmission]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Infer fuel when feed left it empty. */
export function inferFuel(lot: Pick<AuctionLot, "make" | "model" | "engine" | "fuel" | "bodyStyle">): string {
  if (!blank(lot.fuel)) return String(lot.fuel).trim();
  const blob = blobOf(lot);
  if (
    /\b(electric|battery|bev|ev\b|plug-?in)/i.test(blob) ||
    /\btesla\b/i.test(lot.make || "") ||
    /\b(leaf|bolt euv|bolt ev|ioniq 5|ioniq 6|mach-?e|id\.?\d|e-tron|model [3syx])\b/i.test(blob)
  ) {
    return "Electric";
  }
  if (/\b(hybrid|phev|plug.?in hybrid|hev)\b/i.test(blob)) return "Hybrid";
  if (/\b(diesel|tdi|duramax|powerstroke|cummins|ecodiesel)\b/i.test(blob)) return "Diesel";
  if (/\b(flex|e85|cng|lpg|propane|hydrogen|fuel cell)\b/i.test(blob)) return "Gasoline";
  // USA auction lots with a gasoline-style displacement almost always run on gas
  if (/\d+(\.\d+)?\s*l\b/i.test(lot.engine || "")) return "Gasoline";
  return "—";
}

/** Infer drivetrain from model / trim naming. */
export function inferDrive(lot: Pick<AuctionLot, "make" | "model" | "drive" | "bodyStyle" | "engine">): string {
  if (!blank(lot.drive)) {
    const d = String(lot.drive).trim();
    // Copart UK junk
    if (/axle|rigid/i.test(d)) {
      /* fall through */
    } else {
      return d;
    }
  }
  const blob = blobOf(lot);
  if (
    /\b(4x4|4wd|four[-\s]?wheel|awd|all[-\s]?wheel|quattro|xdrive|4matic|sh-?awd|super[-\s]?select|i-?mm|symmetrical)\b/i.test(
      blob,
    )
  ) {
    if (/\b(4x4|4wd|four[-\s]?wheel)\b/i.test(blob)) return "4WD";
    return "AWD";
  }
  if (/\b(rwd|rear[-\s]?wheel|2wd rear)\b/i.test(blob)) return "RWD";
  if (/\b(fwd|front[-\s]?wheel|2wd front)\b/i.test(blob)) return "FWD";

  // Common body/model defaults (conservative)
  const model = (lot.model || "").toLowerCase();
  if (
    /\b(wrangler|bronco|4runner|tacoma|tundra|sierra|silverado|f-?15[0-9]|f-?25[0-9]|ram 1[5-9]|ram 25|ranger|gladiator|yukon|tahoe|suburban|sequoia|armada|titan|ridgeline|colorado|canyon)\b/.test(
      model,
    )
  ) {
    return "4WD";
  }
  if (
    /\b(dbx|cayenne|macan|x[1-7]\b|gle|glc|gls|gla|glb|q[3578]|rx|gx|lx|nx|mdx|rdx|highlander|pilot|pathfinder|explorer|expedition|traverse|atlas|tiguan|outback|forester|crosstrek|ascent|rav4|cr-?v|hr-?v|cx-?[5-9]|tucson|sportage|sorento|santa fe|palisade|telluride|grand cherokee|cherokee|compass|wagoneer|durango|aspen)\b/.test(
      model,
    )
  ) {
    return "AWD";
  }
  if (/\b(mustang|camaro|challenger|charger|corvette|911|cayman|supra|brz|86|miata|mx-?5)\b/.test(model)) {
    return "RWD";
  }
  if (/\b(civic|corolla|camry|accord|altima|sentra|elantra|sonata|jetta|passat|mazda3|mazda6|impreza|legacy)\b/.test(model)) {
    return "FWD";
  }
  return "—";
}

/** Infer gearbox — USA salvage feed almost never sends this; use trim hints. */
export function inferTransmission(
  lot: Pick<AuctionLot, "make" | "model" | "transmission" | "engine" | "bodyStyle" | "year">,
): string {
  if (!blank(lot.transmission)) return String(lot.transmission).trim();
  const blob = blobOf(lot);
  if (/\b(cvt|xtronic|ecvt)\b/i.test(blob)) return "CVT";
  if (/\b(manual|mt\b|stick|6[-\s]?speed manual|5[-\s]?speed manual)\b/i.test(blob)) return "Manual";
  if (/\b(auto|a\/t|automatic|dct|dsg|pdk|tiptronic|s-?tronic)\b/i.test(blob)) return "Automatic";
  // Modern USA auction cars are overwhelmingly automatic when engine data exists
  if ((lot.year ?? 0) >= 2000 && !blank(lot.engine)) return "Automatic";
  return "—";
}

export function enrichLotSpecs<T extends AuctionLot>(lot: T): T {
  return {
    ...lot,
    fuel: inferFuel(lot),
    drive: inferDrive(lot),
    transmission: inferTransmission(lot),
  };
}

const FUEL_RU: Record<string, string> = {
  Gasoline: "Бензин",
  Petrol: "Бензин",
  Diesel: "Дизель",
  Hybrid: "Гибрид",
  Electric: "Электро",
  Gas: "Газ",
};

const TRANS_RU: Record<string, string> = {
  Automatic: "Автомат",
  Manual: "Механика",
  CVT: "Вариатор",
};

const DRIVE_RU: Record<string, string> = {
  AWD: "Полный (AWD)",
  "4WD": "Полный (4WD)",
  "4x4": "Полный (4x4)",
  FWD: "Передний",
  RWD: "Задний",
};

export function formatFuelRu(value: string): string {
  if (blank(value)) return "—";
  return FUEL_RU[value] || value;
}

export function formatTransmissionRu(value: string): string {
  if (blank(value)) return "—";
  return TRANS_RU[value] || value;
}

export function formatDriveRu(value: string): string {
  if (blank(value)) return "—";
  return DRIVE_RU[value] || value;
}
