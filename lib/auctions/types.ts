export type AuctionRegion = "usa" | "uk" | "korea" | "china";

export type AuctionSource =
  | "copart"
  | "iaai"
  | "copart_uk"
  | "manheim"
  | "salvage_market"
  | "encar"
  | "china_market";

export type TitleType = "clean" | "salvage" | "rebuilt" | "parts_only";

/** Manheim, SalvageMarket и Copart UK Cat B — закрытые аукционы (доступ через дилера). */
export function isClosedAuction(lot: {
  source: AuctionSource;
  category?: string;
  titleLabel?: string;
}): boolean {
  if (lot.source === "manheim" || lot.source === "salvage_market") return true;
  if (lot.source === "copart_uk") {
    const raw = String(lot.category ?? "").trim().toUpperCase();
    if (["B", "CAT B", "CATEGORY B", "CATB"].includes(raw)) return true;
    return /\bCAT(?:EGORY)?\s*B\b/i.test(`${lot.category ?? ""} ${lot.titleLabel ?? ""}`);
  }
  return false;
}

export const CLOSED_AUCTION_LABEL = "Закрытый аукцион";
export const CLOSED_AUCTION_HINT =
  "Участие только через дилера / брокера. Ставка и выкуп оформляются менеджером MG.GROUP.";

export type AuctionLot = {
  id: string;
  slug: string;
  region: AuctionRegion;
  source: AuctionSource;
  lotNumber: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  titleType: TitleType;
  titleLabel: string;
  primaryDamage: string;
  secondaryDamage?: string;
  odometer: number;
  odometerUnit: "mi" | "km";
  currentBid: number;
  buyNowPrice?: number;
  currency: "USD" | "GBP" | "KRW";
  location: string;
  auctionDate: string;
  imageUrl: string;
  transmission: string;
  fuel: string;
  drive: string;
  exteriorColor: string;
  hasKeys: boolean;
  runsDrives: boolean;
  estimatedRetail?: number;
  /** e.g. "3.0L V6 Twin Turbo" */
  engine?: string;
  bodyStyle?: string;
  /** Copart UK category: A, B, S, N */
  category?: string;
  vatOnSale?: boolean;
  /** USA inland miles to port (Bid.cars) */
  inlandMiles?: number;
  weightKg?: number;
  /** External auction / aggregator URL */
  lotUrl?: string;
  imageUrls?: string[];
  /** Seeded / placeholder inventory — keep noindex until real feed */
  _demo?: boolean;
};

export type CatalogQuickTab = "all" | "passable" | "open" | "buy-now";

export type CatalogSort =
  | "date_asc"
  | "date_desc"
  | "price_asc"
  | "price_desc"
  | "year_desc"
  | "year_asc";

export type CatalogFilters = {
  q?: string;
  make?: string;
  model?: string;
  yearFrom?: number;
  yearTo?: number;
  auctions: AuctionSource[];
  /** Filter by catalog region (usa / korea / china / uk) */
  region?: AuctionRegion | "";
  priceMin?: number;
  priceMax?: number;
  /** Body style substring match */
  body?: string;
  /** Primary damage substring match */
  damage?: string;
  drive?: string;
  trans?: string;
  fuel?: string;
  /** Max odometer in miles */
  mileageMax?: number;
  /** Engine volume liters */
  engMin?: number;
  engMax?: number;
  /** Auction date ISO day bounds (inclusive), e.g. 2026-09-20 */
  dateFrom?: string;
  dateTo?: string;
  titleType?: TitleType | "";
  /** Copart UK category A/B/S/N */
  category?: string;
  location?: string;
  hasKeys?: boolean;
  run: boolean;
  buynow: boolean;
  arch: boolean;
  tab: CatalogQuickTab;
  sort?: CatalogSort;
};

export const PRICE_PRESETS_USD = [
  { label: "До $2k", max: 2_000 },
  { label: "До $5k", max: 5_000 },
  { label: "До $10k", max: 10_000 },
  { label: "До $20k", max: 20_000 },
] as const;

export const PRICE_PRESETS_GBP = [
  { label: "До £1k", max: 1_000 },
  { label: "До £3k", max: 3_000 },
  { label: "До £5k", max: 5_000 },
  { label: "До £10k", max: 10_000 },
] as const;

export const DATE_PRESETS = [
  { label: "Сегодня", days: 0 },
  { label: "Завтра", days: 1 },
  { label: "3 дня", days: 3 },
  { label: "7 дней", days: 7 },
  { label: "14 дней", days: 14 },
] as const;

export const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: "date_asc", label: "Скоро торги" },
  { value: "date_desc", label: "Поздние торги" },
  { value: "price_asc", label: "Дешевле" },
  { value: "price_desc", label: "Дороже" },
  { value: "year_desc", label: "Новее год" },
  { value: "year_asc", label: "Старше год" },
];

export const FUEL_OPTIONS = ["Gasoline", "Diesel", "Hybrid", "Electric", "Gas"] as const;
export const TRANS_OPTIONS = ["Automatic", "Manual", "CVT"] as const;
export const DRIVE_OPTIONS = ["FWD", "RWD", "AWD", "4x4"] as const;
export const MILEAGE_PRESETS = [
  { label: "До 50 000 mi", value: 50_000 },
  { label: "До 100 000 mi", value: 100_000 },
  { label: "До 150 000 mi", value: 150_000 },
  { label: "До 200 000 mi", value: 200_000 },
] as const;

export const SOURCE_LABELS: Record<AuctionSource, string> = {
  copart: "Copart",
  iaai: "IAAI",
  copart_uk: "Copart UK",
  manheim: "Manheim",
  salvage_market: "SalvageMarket",
  encar: "Encar",
  china_market: "Китай",
};

export const REGION_LABELS: Record<AuctionRegion, string> = {
  usa: "США",
  uk: "Англия",
  korea: "Корея",
  china: "Китай",
};
export const TITLE_LABELS: Record<TitleType, string> = {
  clean: "Clean Title",
  salvage: "Salvage",
  rebuilt: "Rebuilt",
  parts_only: "Parts Only",
};

export const DAMAGE_OPTIONS = [
  "All Over",
  "Front End",
  "Rear End",
  "Side",
  "Minor Dent/Scratches",
  "Hail",
  "Flood",
  "Burn",
  "Mechanical",
  "Normal Wear",
] as const;

export const MAKE_OPTIONS = [
  "Acura",
  "Audi",
  "BMW",
  "Chevrolet",
  "Ford",
  "Honda",
  "Hyundai",
  "Jeep",
  "Kia",
  "Land Rover",
  "Lexus",
  "Mercedes-Benz",
  "Nissan",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Vauxhall",
] as const;
