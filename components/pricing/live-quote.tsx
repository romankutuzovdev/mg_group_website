"use client";

import type { AuctionLot } from "@/lib/auctions/types";
import type { FxRateInfo } from "@/lib/pricing/fx-rate";
import { quoteCopartUk, type CopartQuote } from "@/lib/pricing/copart-uk";
import { quoteIaaiUsa, type IaaiQuote } from "@/lib/pricing/iaai-usa";
import { parseBidInput } from "./use-fx-rate";

export type LiveQuote = CopartQuote | IaaiQuote;

export function computeLiveQuote(
  lot: AuctionLot,
  bidText: string,
  fx: FxRateInfo,
  options: {
    inlandMilesText?: string;
    dismantleKg?: string;
  } = {},
): LiveQuote | null {
  const bid = parseBidInput(bidText);
  const inlandMiles = parseBidInput(options.inlandMilesText ?? "450") || 450;
  const kgRaw = options.dismantleKg?.trim();
  const kg = kgRaw ? parseFloat(kgRaw) : null;
  const dismantleKg = kg != null && Number.isFinite(kg) && kg > 0 ? kg : null;

  const title = `${lot.year} ${lot.make} ${lot.model}`;
  const bodyStyle = lot.bodyStyle ?? lot.model;

  if (lot.region === "uk") {
    return quoteCopartUk({
      bid: lot.currency === "GBP" ? bid : bid * 0.79,
      location: lot.location,
      category: lot.category,
      title,
      bodyStyle,
      vatOnSale: lot.vatOnSale,
      fxRate: fx.rate,
      fxMarketRate: fx.marketRate,
      dismantleKg,
    });
  }

  return quoteIaaiUsa({
    bid,
    title,
    bodyStyle,
    location: lot.location,
    inlandMiles,
    dismantleKg,
    volume: "standard",
    includeAmericaDelivery: true,
  });
}

export function computeCalculatorQuote(
  tab: "uk" | "usa",
  bidText: string,
  fx: FxRateInfo,
  options: {
    location: string;
    category: string;
    bodyStyle: string;
    vatOnSale: boolean;
    inlandMilesText: string;
  },
): LiveQuote | null {
  const bid = parseBidInput(bidText);
  const inlandMiles = parseBidInput(options.inlandMilesText) || 450;

  if (tab === "uk") {
    return quoteCopartUk({
      bid,
      location: options.location,
      category: options.category || undefined,
      title: options.bodyStyle,
      bodyStyle: options.bodyStyle,
      vatOnSale: options.vatOnSale,
      fxRate: fx.rate,
      fxMarketRate: fx.marketRate,
    });
  }

  return quoteIaaiUsa({
    bid,
    title: options.bodyStyle,
    bodyStyle: options.bodyStyle,
    location: "TX - Dallas",
    inlandMiles,
    volume: "standard",
    includeAmericaDelivery: true,
  });
}

function gbp(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function QuoteTotals({ quote, region }: { quote: LiveQuote; region: "uk" | "usa" }) {
  if (region === "uk" && "totalUk" in quote) {
    return (
      <div className="mt-4 space-y-2 rounded-lg bg-accent/10 p-4 text-center">
        <div>
          <p className="text-xs text-text-muted">Итого UK</p>
          <p className="font-display text-xl font-bold text-text-primary">{gbp(quote.totalUk)}</p>
        </div>
        {quote.grandUsd != null ? (
          <div>
            <p className="text-xs text-text-muted">Итого</p>
            <p className="font-display text-2xl font-bold text-accent-dark">{usd(quote.grandUsd)}</p>
          </div>
        ) : null}
      </div>
    );
  }

  if ("grandUsd" in quote && quote.grandUsd != null) {
    return (
      <div className="mt-4 rounded-lg bg-accent/10 p-4 text-center">
        <p className="text-xs text-text-muted">Итого</p>
        <p className="font-display text-2xl font-bold text-accent-dark">{usd(quote.grandUsd)}</p>
      </div>
    );
  }

  return null;
}
