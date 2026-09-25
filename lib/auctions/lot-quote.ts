import type { AuctionLot } from "@/lib/auctions/types";
import { DEFAULT_FX, fetchFxRateGbpUsd } from "@/lib/pricing/fx-rate";
import { quoteCopartUk, type CopartQuote } from "@/lib/pricing/copart-uk";
import { estimateIaaiWholesale, quoteIaaiUsa, type IaaiQuote } from "@/lib/pricing/iaai-usa";
import {
  quoteRestoration,
  type RestorationQuote,
} from "@/lib/pricing/restoration-quote";

export type LotQuoteResult =
  | { region: "uk"; quote: CopartQuote; fxSource: string }
  | { region: "usa"; quote: IaaiQuote | RestorationQuote; mode: LotPricingMode };

/** Режим просчёта: целые авто (доставка) vs машинокомплект (разбор). */
export type LotPricingMode = "restoration" | "kit";

/**
 * Аукционный сбор по таблице IAAI (как в боте), не фиксированные Bid.cars $650.
 * @deprecated use estimateIaaiAuctionFeesUsd
 */
export const DEFAULT_BIDCARS_FEES_USD = 650;

/** Сумма buyer + virtual + service + environmental + title (IAAI). */
export function estimateIaaiAuctionFeesUsd(
  bid: number,
  options: { bidMethod?: "live" | "proxy"; volume?: "high" | "standard" } = {},
): number {
  return estimateIaaiWholesale(bid, {
    bidMethod: options.bidMethod ?? "live",
    volume: options.volume ?? "standard",
  }).feesNet;
}

/** Разбор калькулятора для карточек / кейсов / купленных авто. */
export type LotTurnkeyBreakdown = {
  /** Итого */
  amount: number;
  currency: "USD" | "GBP";
  label: string;
  /** Ставка + аукционные сборы (в валюте итога) */
  auctionTotal: number;
  /** Доставка (inland / ocean / UK delivery) */
  delivery: number;
  /** Разбор (0 для restoration) */
  dismantle: number;
  /** Прочее: диспетчинг, transfer, title и т.п. */
  otherFees: number;
  /** Доставка + разбор + прочие сборы (без аукциона) */
  deliveryAndFees: number;
};

function lotMeta(lot: AuctionLot) {
  const title = `${lot.year} ${lot.make} ${lot.model}`;
  const bodyStyle = lot.bodyStyle ?? lot.model;
  return { title, bodyStyle };
}

export function defaultPricingMode(lot: AuctionLot): LotPricingMode {
  if (lot.region === "korea" || lot.region === "china") return "restoration";
  return lot.region === "usa" ? "restoration" : "kit";
}

export function quoteUsaRestoration(
  lot: AuctionLot,
  options: {
    bid?: number;
    auctionFeesUsd?: number;
    oceanDestination?: "klaipeda" | "poti";
    vehicleSize?: string;
    titleCode?: string;
    isSublot?: boolean;
    volume?: "high" | "standard";
  } = {},
): RestorationQuote | null {
  const platform = lot.source === "copart" ? "copart" : "iaai";
  const bid = options.bid ?? lot.currentBid;
  const fees =
    options.auctionFeesUsd ??
    estimateIaaiAuctionFeesUsd(bid, { volume: options.volume ?? "standard" });
  return quoteRestoration({
    bid,
    auctionFeesUsd: fees,
    location: lot.location,
    auctionPlatform: platform,
    vehicleSize: options.vehicleSize ?? "regular",
    oceanDestination: options.oceanDestination ?? "klaipeda",
    titleCode: options.titleCode ?? lot.titleLabel,
    isSublot: options.isSublot ?? false,
    includeDelivery: true,
  });
}

function quoteUsaKit(lot: AuctionLot) {
  const { title, bodyStyle } = lotMeta(lot);
  return quoteIaaiUsa({
    bid: lot.currentBid,
    title,
    bodyStyle,
    location: lot.location,
    inlandMiles: lot.inlandMiles ?? 450,
    dismantleKg: lot.weightKg,
    volume: "standard",
    includeAmericaDelivery: true,
  });
}

function quoteUk(lot: AuctionLot, fxRate: number, fxMarketRate: number) {
  const { title, bodyStyle } = lotMeta(lot);
  return quoteCopartUk({
    bid: lot.currency === "GBP" ? lot.currentBid : lot.currentBid * 0.79,
    location: lot.location,
    category: lot.category,
    title,
    bodyStyle,
    vatOnSale: lot.vatOnSale,
    fxRate,
    fxMarketRate,
    dismantleKg: lot.weightKg,
  });
}

function breakdownFromRestoration(quote: RestorationQuote): LotTurnkeyBreakdown {
  const auctionTotal = Math.round(quote.auctionTotal);
  const delivery = Math.round(
    (quote.delivery?.inlandUsd ?? 0) + (quote.delivery?.oceanUsd ?? 0),
  );
  const otherFees = Math.round(
    quote.dispatchingUsd + quote.transferFee + quote.titleDocUsd + quote.sublotUsd,
  );
  const amount = Math.round(quote.grandUsd);
  return {
    amount,
    currency: "USD",
    label: "Цена с доставкой",
    auctionTotal,
    delivery,
    dismantle: 0,
    otherFees,
    deliveryAndFees: Math.max(0, amount - auctionTotal),
  };
}

function breakdownFromUsaKit(quote: IaaiQuote): LotTurnkeyBreakdown {
  const auctionTotal = Math.round(quote.iaai.iaaiTotal);
  const delivery = Math.round(quote.deliveryUsa?.inlandUsd ?? 0);
  const dismantle = Math.round(quote.dismantleUsd);
  const otherFees = Math.round(quote.dispatchingUsd + quote.transferFee);
  const amount = Math.round(quote.grandUsd);
  return {
    amount,
    currency: "USD",
    label: "Цена с разборкой",
    auctionTotal,
    delivery,
    dismantle,
    otherFees,
    deliveryAndFees: Math.max(0, amount - auctionTotal),
  };
}

function breakdownFromUk(quote: CopartQuote): LotTurnkeyBreakdown | null {
  if (quote.grandUsd != null && quote.englandUsd != null && quote.totalUk > 0) {
    const englandUsd = quote.englandUsd;
    const auctionTotal = Math.round((quote.copart.copartTotal / quote.totalUk) * englandUsd);
    const delivery = Math.round((quote.delivery.amount / quote.totalUk) * englandUsd);
    const otherFees = Math.round((quote.transferFee / quote.totalUk) * englandUsd);
    const dismantle = Math.round(quote.dismantleUsd);
    const amount = Math.round(quote.grandUsd);
    return {
      amount,
      currency: "USD",
      label: "Цена с разборкой",
      auctionTotal,
      delivery,
      dismantle,
      otherFees,
      deliveryAndFees: Math.max(0, amount - auctionTotal),
    };
  }

  const auctionTotal = Math.round(quote.copart.copartTotal);
  const delivery = Math.round(quote.delivery.amount);
  const otherFees = Math.round(quote.transferFee);
  const dismantle = Math.round(quote.dismantleUsd);
  const amount = Math.round(quote.totalUk);
  return {
    amount,
    currency: "GBP",
    label: "Цена с разборкой",
    auctionTotal,
    delivery,
    dismantle,
    otherFees,
    deliveryAndFees: Math.max(0, amount - auctionTotal),
  };
}

/** Полный просчёт из калькулятора (синхронно; UK — default FX). */
export function estimateLotBreakdown(
  lot: AuctionLot,
  mode: LotPricingMode = defaultPricingMode(lot),
): LotTurnkeyBreakdown | null {
  try {
    if (lot.region === "korea" || lot.region === "china") {
      // List price already in USD (Encar/China demo ingest)
      if (!lot.currentBid) return null;
      return {
        amount: Math.round(lot.currentBid),
        currency: "USD",
        label: lot.region === "korea" ? "Цена Encar (≈ USD)" : "Цена с рынка (≈ USD)",
        auctionTotal: Math.round(lot.currentBid),
        delivery: 0,
        dismantle: 0,
        otherFees: 0,
        deliveryAndFees: 0,
      };
    }
    if (lot.region === "uk") {
      const quote = quoteUk(lot, DEFAULT_FX.rate, DEFAULT_FX.marketRate);
      if (!quote) return null;
      return breakdownFromUk(quote);
    }
    if (mode === "kit") {
      const quote = quoteUsaKit(lot);
      if (!quote) return null;
      return breakdownFromUsaKit(quote);
    }
    const quote = quoteUsaRestoration(lot);
    if (!quote) return null;
    return breakdownFromRestoration(quote);
  } catch {
    return null;
  }
}

/** Sync estimate for cards / lists (UK uses default FX). */
export function estimateLotTurnkey(
  lot: AuctionLot,
  mode: LotPricingMode = defaultPricingMode(lot),
): {
  amount: number;
  currency: "USD" | "GBP";
  label: string;
} | null {
  const b = estimateLotBreakdown(lot, mode);
  if (!b) return null;
  return { amount: b.amount, currency: b.currency, label: b.label };
}

export async function buildLotQuote(
  lot: AuctionLot,
  mode: LotPricingMode = defaultPricingMode(lot),
): Promise<LotQuoteResult | null> {
  if (lot.region === "uk") {
    const fx = await fetchFxRateGbpUsd();
    const quote = quoteUk(lot, fx.rate, fx.marketRate);
    if (!quote) return null;
    return { region: "uk", quote, fxSource: fx.source };
  }

  if (lot.region === "korea" || lot.region === "china") {
    return null;
  }

  if (mode === "kit") {
    const quote = quoteUsaKit(lot);
    if (!quote) return null;
    return { region: "usa", quote, mode };
  }

  const quote = quoteUsaRestoration(lot);
  if (!quote) return null;
  return { region: "usa", quote, mode };
}

export function lotTitle(lot: AuctionLot): string {
  return `${lot.year} ${lot.make} ${lot.model}`;
}
