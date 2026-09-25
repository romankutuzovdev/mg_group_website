"use client";

import type { CopartQuote } from "@/lib/pricing/copart-uk";
import type { IaaiQuote } from "@/lib/pricing/iaai-usa";

function gbp(value: number | null | undefined, digits = 0) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function usd(value: number | null | undefined, digits = 0) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function Row({
  label,
  hint,
  value,
  total,
  highlight,
}: {
  label: string;
  hint?: string;
  value: string;
  total?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 border-b border-border py-2 text-sm last:border-0 ${
        total ? "font-semibold" : ""
      } ${highlight ? "text-accent-dark" : ""}`}
    >
      <div>
        <span className={total ? "text-text-primary" : "text-text-secondary"}>{label}</span>
        {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      </div>
      <span className="shrink-0 font-medium">{value}</span>
    </div>
  );
}

export function CopartQuoteDisplay({ quote }: { quote: CopartQuote }) {
  const vatOnSale = quote.copart.vatOnSale || quote.copart.vatSale > 0;
  return (
    <div className="space-y-1">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-accent">Copart UK</p>
      {vatOnSale ? (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {quote.categoryB
            ? "Cat B — VAT 20% на комиссии и ставку"
            : "VAT 20% на комиссии и ставку"}
        </p>
      ) : null}
      <Row label="Ставка" value={gbp(quote.copart.bid, 2)} />
      <Row
        label="Аукционный сбор"
        value={gbp(quote.copart.feesNet + quote.copart.vatFees, 2)}
      />
      {vatOnSale ? (
        <Row label="VAT на ставку" value={gbp(quote.copart.vatSale, 2)} highlight />
      ) : null}
      <Row
        label="Доставка"
        hint={`${quote.delivery.regionKey}, ${quote.delivery.label}`}
        value={gbp(quote.delivery.amount, 2)}
      />
      <Row label="Комиссия 3%" value={gbp(quote.transferFee, 2)} />
      <Row label="Итого UK" value={gbp(quote.totalUk, 2)} total />
      {quote.fxRate ? (
        <Row label="Расходы Англии" value={usd(quote.englandUsd, 2)} />
      ) : null}
      <Row label="Разбор" value={usd(quote.dismantleUsd)} />
      {quote.grandUsd != null ? (
        <Row label="Итого" value={usd(quote.grandUsd, 2)} total highlight />
      ) : null}
    </div>
  );
}

export function IaaiQuoteDisplay({ quote }: { quote: IaaiQuote }) {
  const fees = quote.iaai;
  return (
    <div className="space-y-1">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-accent">
        IAAI USA — {fees.volumeLabel}
      </p>
      <Row label="Ставка" value={usd(fees.bid, 2)} />
      <Row label="Аукционный сбор" value={usd(fees.feesNet, 2)} />
      {quote.deliveryUsa ? (
        <Row
          label="Доставка по США"
          hint={`${quote.deliveryUsa.inlandMiles ?? "—"} mi × $1/mi`}
          value={usd(quote.deliveryUsa.inlandUsd, 0)}
        />
      ) : null}
      <Row label="Диспетчинг" value={usd(quote.dispatchingUsd)} />
      <Row label="Комиссия 3%" value={usd(quote.transferFee, 2)} />
      <Row label="Расходы США" value={usd(quote.usaWithFees, 2)} total />
      <Row label="Разбор, доставка и растаможка" value={usd(quote.dismantleUsd)} />
      <Row label="Итого" value={usd(quote.grandUsd, 2)} total highlight />
    </div>
  );
}
