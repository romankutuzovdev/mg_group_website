import type { CopartQuote } from "./copart-uk";
import type { IaaiQuote } from "./iaai-usa";
import type { RestorationQuote } from "./restoration-quote";
import type { CustomsByResult } from "./customs-by";
import type { CustomsCalcResult, CustomsCalcError } from "./customs-calculator";

export type QuoteCurrency = "USD" | "GBP" | "EUR" | "BYN";
export type QuoteLine = { label: string; amount: number; currency: QuoteCurrency };
export type QuoteSnapshot = {
  kind: "usa" | "uk" | "restoration" | "customs";
  title: string;
  lot_url?: string;
  location?: string;
  bid?: number | null;
  currency?: QuoteCurrency;
  total_usd: number;
  summary?: string;
  image_url?: string;
  breakdown?: QuoteLine[];
};
export type SharedQuote = { id: string; created_at: string; quote: QuoteSnapshot };
type QuoteMeta = Pick<QuoteSnapshot, "title" | "lot_url" | "location" | "image_url" | "summary">;

export const QUOTE_KIND_LABELS: Record<QuoteSnapshot["kind"], string> = {
  usa: "Машинокомплект · США",
  uk: "Машинокомплект · Англия",
  restoration: "Авто под восстановление",
  customs: "Растаможка РБ",
};

function meta(input: QuoteMeta): QuoteMeta {
  const http = (url?: string) => /^https?:\/\//i.test(url || "") ? url : "";
  return {
    title: input.title.slice(0, 240),
    location: input.location?.slice(0, 160) || "",
    lot_url: http(input.lot_url),
    image_url: http(input.image_url) ||
      (/^\/(?:api\/lot-photos\/|api\/lot-image(?:\?|\/)|auctions\/lots\/)/.test(input.image_url || "") ? input.image_url : ""),
    summary: input.summary?.slice(0, 1000) || "",
  };
}

function lines(parts: Array<[string, number | null | undefined]>, currency: QuoteCurrency = "USD"): QuoteLine[] {
  return parts
    .filter(([, amount]) => amount != null && Number.isFinite(amount) && amount >= 0)
    .map(([label, amount]) => ({ label, amount: Math.round(amount! * 100) / 100, currency }));
}

export function kitQuoteSnapshot(quote: CopartQuote | IaaiQuote, input: QuoteMeta): QuoteSnapshot | null {
  if (quote.grandUsd == null || !Number.isFinite(quote.grandUsd) || quote.grandUsd <= 0) return null;
  if ("totalUk" in quote) {
    const rate = quote.fxRate;
    if (!rate || rate <= 0) return null;
    return {
      ...meta(input), kind: "uk", bid: quote.copart.bid, currency: "GBP",
      total_usd: Math.round(quote.grandUsd),
      summary: [input.summary, `Расходы Англии переведены в USD по курсу £1 = $${rate.toFixed(4)}.`].filter(Boolean).join(" ").slice(0, 1000),
      breakdown: lines([
        ["Ставка", quote.copart.bid * rate],
        ["Аукционный сбор", (quote.copart.feesNet + quote.copart.vatFees) * rate],
        ["VAT на ставку", quote.copart.vatSale * rate],
        ["Доставка по Англии", quote.delivery.amount * rate],
        ["Комиссия 3,5%", quote.transferFee * rate],
        ["Разбор и отправка", quote.dismantleUsd],
      ]),
    };
  }
  return {
    ...meta(input), kind: "usa", bid: quote.iaai.bid, currency: "USD",
    total_usd: Math.round(quote.grandUsd),
    breakdown: lines([
      ["Ставка", quote.iaai.bid], ["Аукционный сбор", quote.iaai.feesNet],
      ["Доставка по США", quote.deliveryUsa?.inlandUsd],
      ["Услуги компании США", quote.dispatchingUsd], ["Комиссия 3,5%", quote.transferFee],
      ["Разбор, доставка и растаможка", quote.dismantleUsd],
    ]),
  };
}

export function restorationQuoteSnapshot(
  quote: RestorationQuote,
  input: QuoteMeta,
  extras: QuoteLine[] = [],
  customs: CustomsByResult | null = null,
): QuoteSnapshot | null {
  if (!quote.delivery || !Number.isFinite(quote.grandUsd) || quote.grandUsd <= 0) return null;
  const customsUsd = customs?.ok && customs.totalUsd != null ? customs.totalUsd : null;
  const total = quote.grandUsd + extras.reduce((sum, line) => sum + line.amount, 0) + (customsUsd ?? 0);
  return {
    ...meta(input), kind: "restoration", bid: quote.bid, currency: "USD", total_usd: Math.round(total),
    summary: [input.summary, customsUsd != null ? "С растаможкой РБ." : "Без растаможки РБ."].filter(Boolean).join(" ").slice(0, 1000),
    breakdown: [
      ...lines([
        ["Ставка", quote.bid], ["Аукционный сбор", quote.auctionFeesUsd],
        ["Доставка по США", quote.delivery.inlandUsd],
        [`Море → ${quote.delivery.oceanDestination === "poti" ? "Poti" : "Klaipeda"}`, quote.delivery.oceanUsd],
        ["Документы (Title / Sale Doc)", quote.titleDocUsd],
        ["Sublot / Offsite", quote.isSublot ? quote.sublotUsd : null],
        ["Услуги компании США", quote.dispatchingUsd], ["Оформление документов", quote.docsFeeUsd],
        ["Комиссия 3,5%", quote.transferFee], ["Доставка до Минска", quote.minskDeliveryUsd],
      ]),
      ...extras,
      ...lines([["Растаможка РБ", customsUsd]]),
    ],
  };
}

export function customsQuoteSnapshot(result: CustomsByResult, input: QuoteMeta, priceUsd: number): QuoteSnapshot | null {
  if (!result.ok || result.totalUsd == null || !Number.isFinite(result.totalUsd) || result.totalUsd <= 0) return null;
  return {
    ...meta(input), kind: "customs", bid: priceUsd, currency: "USD", total_usd: Math.round(result.totalUsd),
    summary: [input.summary, result.ageBandLabel, result.engineCc ? `${result.engineCc} см³` : "",
      result.benefit50 ? "Льгота 50%." : "", `Итого ${formatQuoteMoney(result.totalByn, "BYN")}.`,
      `Курс USD/BYN: ${result.rates.USD_BYN}.`].filter(Boolean).join(" ").slice(0, 1000),
    breakdown: lines([
      ["Таможенная пошлина", result.dutyByn],
      ...result.feeLines.map((line): [string, number] => [line.label, line.byn]),
    ], "BYN"),
  };
}

export function formatQuoteMoney(amount: number, currency: QuoteCurrency = "USD"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(amount);
}

export function publicCustomsQuoteSnapshot(result: CustomsCalcResult | CustomsCalcError, priceEur: number): QuoteSnapshot | null {
  if (!result.ok || !Number.isFinite(result.totalUsd) || result.totalUsd <= 0) return null;
  return {
    kind: "customs", title: "Растаможка РБ", bid: priceEur, currency: "EUR", total_usd: Math.round(result.totalUsd),
    summary: `${result.summary}. Под ключ: ${formatQuoteMoney(result.totalEur, "EUR")}. Растаможка: ${formatQuoteMoney(result.clearanceByn, "BYN")}.`,
    breakdown: result.lines.map((line) => ({ label: line.label, amount: line.amount, currency: line.currency })),
  };
}

export function formatQuoteText(quote: QuoteSnapshot, url?: string): string {
  return [
    "MG.GROUP · Просчёт", quote.title, QUOTE_KIND_LABELS[quote.kind],
    quote.location ? `Площадка: ${quote.location}` : "",
    quote.bid != null ? `${quote.kind === "customs" ? "Стоимость авто" : "Исходная ставка"}: ${formatQuoteMoney(quote.bid, quote.currency)}` : "",
    "", ...(quote.breakdown || []).map((line) => `${line.label}: ${formatQuoteMoney(line.amount, line.currency)}`),
    "", `Итого: ${formatQuoteMoney(quote.total_usd)}`, quote.summary || "", "",
    "Цена ориентировочная. Точный расчёт уточняйте у менеджера.", url || "",
  ].join("\n").trim();
}
