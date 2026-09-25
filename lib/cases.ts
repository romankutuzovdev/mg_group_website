import { SOURCE_LABELS, type AuctionLot } from "@/lib/auctions/types";
import { formatOdometerKm } from "@/lib/auctions/odometer";
import { hashSeed, pickDiverseAuctionLots } from "@/lib/auctions/example-picks";
import { estimateLotBreakdown } from "@/lib/auctions/lot-quote";
import { marketPriceFromTurnkey } from "@/lib/pricing/market-savings";

export type CaseCurrency = "USD" | "GBP";

export type ClientCase = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  region: "США" | "Англия";
  source: string;
  /** Бюджет / итог под ключ (калькулятор) */
  budget: number;
  market: number;
  currency: CaseCurrency;
  /** Срок от выкупа до Минска */
  days: number;
  story: string;
  result: string;
  href?: string;
};

function lotToCase(lot: AuctionLot): ClientCase | null {
  if (lot.region !== "usa" && lot.region !== "uk") return null;

  const quote = estimateLotBreakdown(lot);
  if (!quote || quote.amount <= 0) return null;

  const seed = hashSeed(lot.id);
  const days = lot.region === "uk" ? 32 + (seed % 12) : 44 + (seed % 14);
  const damage =
    lot.primaryDamage && lot.primaryDamage !== "Unknown" ? lot.primaryDamage : "salvage";
  const bidLabel = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: lot.currency,
    maximumFractionDigits: 0,
  }).format(lot.currentBid);

  return {
    id: `auction-${lot.id}`,
    title: `${lot.make} ${lot.model} ${lot.year}`,
    subtitle: `Лот #${lot.lotNumber} · ставка ${bidLabel}`,
    image: lot.imageUrl,
    region: lot.region === "uk" ? "Англия" : "США",
    source: SOURCE_LABELS[lot.source],
    budget: quote.amount,
    market: marketPriceFromTurnkey(quote.amount, seed),
    currency: quote.currency,
    days,
    story: `${damage}. Пробег ${formatOdometerKm(lot.odometer, lot.odometerUnit)}. Расчёт под ключ из калькулятора: аукцион + доставка + разбор.`,
    result: quote.label,
    href: `/auctions/${lot.slug}/`,
  };
}

export function getAuctionExampleCases(limit = 6): ClientCase[] {
  return pickDiverseAuctionLots(limit)
    .map(lotToCase)
    .filter((c): c is ClientCase => c != null);
}

/** Только лоты США / Англии из каталога. */
export function getCasesFeedItems(limit?: number): ClientCase[] {
  const items = getAuctionExampleCases(limit ?? 12);
  return limit ? items.slice(0, limit) : items;
}

export function caseSavingsPercent(item: ClientCase) {
  if (item.market <= 0) return 0;
  return Math.round(((item.market - item.budget) / item.market) * 100);
}

export function caseSavedAmount(item: ClientCase) {
  return item.market - item.budget;
}

export function formatCaseMoney(amount: number, currency: CaseCurrency) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function casesSummary(items: ClientCase[] = getCasesFeedItems()) {
  if (!items.length) return { count: 0, avgDays: 0, avgSavings: 0 };
  const avgDays = Math.round(items.reduce((s, c) => s + c.days, 0) / items.length);
  const avgSavings = Math.round(
    items.reduce((s, c) => s + caseSavingsPercent(c), 0) / items.length,
  );
  return { count: items.length, avgDays, avgSavings };
}
