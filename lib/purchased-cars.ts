import { SOURCE_LABELS, type AuctionLot } from "@/lib/auctions/types";
import { formatOdometerKm } from "@/lib/auctions/odometer";
import { hashSeed, pickDiverseAuctionLots } from "@/lib/auctions/example-picks";
import { estimateLotBreakdown } from "@/lib/auctions/lot-quote";
import { marketPriceFromTurnkey } from "@/lib/pricing/market-savings";

export type PurchasedCarCurrency = "USD" | "GBP";

export type PurchasedCar = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  image: string;
  source: string;
  region: "США" | "Англия";
  purchasedAt: string;
  damage: string;
  odometer: string;
  /** Ставка + аукционные сборы (из калькулятора) */
  auctionPrice: number;
  /** Доставка (из калькулятора) */
  delivery: number;
  /** Разбор (из калькулятора) */
  dismantle: number;
  /** Доставка + разбор + прочие сборы (без аукциона) */
  deliveryAndFees: number;
  totalCost: number;
  marketBy: number;
  currency: PurchasedCarCurrency;
  href?: string;
};

const MONTHS_RU = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function lotToPurchased(lot: AuctionLot): PurchasedCar | null {
  if (lot.region !== "usa" && lot.region !== "uk") return null;

  const quote = estimateLotBreakdown(lot);
  if (!quote || quote.amount <= 0) return null;

  const seed = hashSeed(lot.id);
  const month = MONTHS_RU[seed % 12];

  return {
    id: `auction-${lot.id}`,
    year: lot.year,
    make: lot.make,
    model: lot.model,
    image: lot.imageUrl,
    source: SOURCE_LABELS[lot.source],
    region: lot.region === "uk" ? "Англия" : "США",
    purchasedAt: `${month} 2026`,
    damage: lot.primaryDamage || "Salvage",
    odometer: formatOdometerKm(lot.odometer, lot.odometerUnit),
    auctionPrice: quote.auctionTotal,
    delivery: quote.delivery,
    dismantle: quote.dismantle,
    deliveryAndFees: quote.deliveryAndFees,
    totalCost: quote.amount,
    marketBy: marketPriceFromTurnkey(quote.amount, seed),
    currency: quote.currency,
    href: `/auctions/${lot.slug}/`,
  };
}

/** Только лоты США / Англии из аукционного каталога с расчётом под ключ. */
export function getPurchasedCarsFeed(limit?: number): PurchasedCar[] {
  const fromAuctions = pickDiverseAuctionLots(12)
    .map(lotToPurchased)
    .filter((c): c is PurchasedCar => c != null);
  return limit ? fromAuctions.slice(0, limit) : fromAuctions;
}

export function formatMoney(amount: number, currency: PurchasedCarCurrency) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function savingsPercent(car: PurchasedCar) {
  if (car.marketBy <= 0) return 0;
  return Math.round(((car.marketBy - car.totalCost) / car.marketBy) * 100);
}

export function purchasedCarsSummary(cars?: PurchasedCar[]) {
  const pool = cars?.length ? cars : getPurchasedCarsFeed();
  const normalized = pool.map((car) =>
    car.currency === "GBP"
      ? {
          ...car,
          auctionPrice: Math.round(car.auctionPrice * 1.29),
          delivery: Math.round(car.delivery * 1.29),
          dismantle: Math.round(car.dismantle * 1.29),
          deliveryAndFees: Math.round(car.deliveryAndFees * 1.29),
          totalCost: Math.round(car.totalCost * 1.29),
          marketBy: Math.round(car.marketBy * 1.29),
          currency: "USD" as const,
        }
      : car,
  );
  const totalUsd = normalized.reduce((sum, car) => sum + car.totalCost, 0);
  const savedUsd = normalized.reduce((sum, car) => sum + (car.marketBy - car.totalCost), 0);
  const avgSavings =
    normalized.length === 0
      ? 0
      : Math.round(normalized.reduce((sum, car) => sum + savingsPercent(car), 0) / normalized.length);

  return {
    count: pool.length,
    totalUsd,
    savedUsd,
    avgSavings,
  };
}
