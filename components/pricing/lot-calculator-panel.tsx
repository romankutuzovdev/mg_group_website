"use client";

import { useMemo, useState } from "react";
import type { AuctionLot } from "@/lib/auctions/types";
import {
  estimateIaaiAuctionFeesUsd,
  quoteUsaRestoration,
} from "@/lib/auctions/lot-quote";
import type { CopartQuote } from "@/lib/pricing/copart-uk";
import type { RestorationQuote } from "@/lib/pricing/restoration-quote";
import { listTitleTariffs } from "@/lib/pricing/usa-title";
import type { VehicleSize } from "@/lib/pricing/usa-delivery";
import { CopartQuoteDisplay } from "./quote-display";
import { computeLiveQuote, QuoteTotals } from "./live-quote";
import { parseBidInput, useFxRate } from "./use-fx-rate";

type Props = {
  lot: AuctionLot;
};

const TITLE_OPTIONS = listTitleTariffs();

function usd(n: number, digits = 0) {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function Line({
  label,
  value,
  hint,
  total,
}: {
  label: string;
  value: string;
  hint?: string;
  total?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${total ? "border-t border-border pt-2 font-semibold" : ""}`}>
      <dt className={total ? "" : "text-text-muted"}>
        {label}
        {hint ? <span className="mt-0.5 block text-[10px] font-normal text-text-muted">{hint}</span> : null}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function RestorationQuoteLines({ quote }: { quote: RestorationQuote }) {
  return (
    <dl className="space-y-2 text-sm">
      <Line label="Ставка" value={usd(quote.bid)} />
      <Line label="Аукционный сбор" value={usd(quote.auctionFeesUsd)} />
      {quote.delivery ? (
        <>
          <Line
            label="Inland"
            value={usd(quote.delivery.inlandUsd)}
            hint={
              quote.delivery.fromTariff
                ? quote.delivery.matchedLocation || undefined
                : "ручной / fallback"
            }
          />
          <Line
            label={`Море → ${quote.delivery.oceanDestination === "poti" ? "Poti" : "Klaipeda"}`}
            value={usd(quote.delivery.oceanUsd)}
            hint={quote.delivery.usPortLabel || undefined}
          />
        </>
      ) : null}
      {quote.titleDocUsd > 0 ? (
        <Line label="Title / Sale Doc" value={usd(quote.titleDocUsd)} />
      ) : (
        <Line label="Title / Sale Doc" value="без доплат" />
      )}
      {quote.isSublot ? <Line label="Sublot / Offsite" value={usd(quote.sublotUsd)} /> : null}
      <Line label="Диспетчинг" value={usd(quote.dispatchingUsd)} />
      <Line
        label={`Комиссия ${(quote.transferFeeRate * 100).toFixed(1)}%`}
        value={usd(quote.transferFee, 2)}
      />
      <Line label="Цена с доставкой" value={usd(Math.round(quote.grandUsd))} total />
    </dl>
  );
}

function UsaRestorationPanel({ lot }: { lot: AuctionLot }) {
  const platform = lot.source === "copart" ? "copart" : "iaai";
  const [bidText, setBidText] = useState(String(lot.currentBid));
  const [size, setSize] = useState<VehicleSize>("regular");
  const [oceanDest, setOceanDest] = useState<"klaipeda" | "poti">("klaipeda");
  const matchedTitle =
    TITLE_OPTIONS.find((t) => t.name.toLowerCase() === lot.titleLabel.toLowerCase())?.name ??
    TITLE_OPTIONS[0]?.name ??
    lot.titleLabel;
  const [titleCode, setTitleCode] = useState(matchedTitle);
  const [isSublot, setIsSublot] = useState(false);

  const bid = parseBidInput(bidText);
  const fees = useMemo(() => estimateIaaiAuctionFeesUsd(bid), [bid]);

  const quote = useMemo(
    () =>
      quoteUsaRestoration(lot, {
        bid,
        auctionFeesUsd: fees,
        oceanDestination: oceanDest,
        vehicleSize: size,
        titleCode,
        isSublot,
      }),
    [lot, bid, fees, oceanDest, size, titleCode, isSublot],
  );

  return (
    <div className="card-premium rounded-xl p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold">Цена с доставкой</h2>
      <p className="mt-1 text-xs text-text-muted">
        Просчёт авто: ставка, аукционный сбор IAAI, Title и доставка Klaipeda / Poti. Без разбора и без
        таможни.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Ваша ставка, USD
          <input
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            value={bidText}
            onChange={(e) => setBidText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-lg font-semibold text-text-primary"
          />
        </label>
        <div className="rounded-lg border border-border bg-zinc-50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Аукционный сбор
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">{usd(fees)}</p>
        </div>

        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Размер
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as VehicleSize)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
          >
            <option value="regular">Regular / Large</option>
            <option value="oversize">Oversize</option>
            <option value="moto">Moto</option>
          </select>
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Title / Sale Doc
          <select
            value={titleCode}
            onChange={(e) => setTitleCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
          >
            {TITLE_OPTIONS.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} {t.costUsd > 0 ? `($${t.costUsd})` : "(без доплат)"}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`ocean-${lot.id}`}
              checked={oceanDest === "klaipeda"}
              onChange={() => setOceanDest("klaipeda")}
            />
            Klaipeda
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`ocean-${lot.id}`}
              checked={oceanDest === "poti"}
              onChange={() => setOceanDest("poti")}
            />
            Poti
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isSublot} onChange={(e) => setIsSublot(e.target.checked)} />
            Sublot / Offsite (+$100)
          </label>
        </div>

        <p className="text-xs text-text-muted">
          Площадка: <span className="font-medium text-text-secondary">{platform.toUpperCase()}</span>
          {" · "}
          {lot.location}
          {quote?.delivery?.fromTariff
            ? ` · прайс: inland $${Math.round(quote.delivery.inlandUsd)}`
            : " · прайс не найден — fallback"}
        </p>

        {quote ? (
          <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm">
            Расчёт для ${bid.toLocaleString("ru-RU")} →{" "}
            <span className="font-display font-bold text-accent-dark">
              ${Math.round(quote.grandUsd).toLocaleString("en-US")}
            </span>
          </p>
        ) : null}
      </div>

      {quote ? (
        <div className="mt-6 border-t border-border pt-4">
          <RestorationQuoteLines quote={quote} />
        </div>
      ) : null}
    </div>
  );
}

function UkKitPanel({ lot }: { lot: AuctionLot }) {
  const fx = useFxRate();
  const [bidText, setBidText] = useState(String(lot.currentBid));
  const [dismantleKg, setDismantleKg] = useState(lot.weightKg ? String(lot.weightKg) : "");

  const bid = parseBidInput(bidText);
  const fxRate = fx.rate;

  const quote = useMemo(
    () => computeLiveQuote(lot, bidText, fx, { dismantleKg }),
    [lot, bidText, fx, dismantleKg],
  );

  return (
    <div className="card-premium rounded-xl p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold">Цена с разборкой</h2>
      <p className="mt-1 text-xs text-text-muted">
        Copart UK: сборы, доставка и разбор (машинокомплект).
      </p>

      <div className="mt-4 space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Ваша ставка для расчёта ({lot.currency})
          <input
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            value={bidText}
            onChange={(e) => setBidText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-lg font-semibold text-text-primary"
          />
        </label>
        {quote ? (
          <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm">
            Расчёт для £{bid.toLocaleString("ru-RU")} →{" "}
            <span className="font-display font-bold text-accent-dark">
              {"grandUsd" in quote && quote.grandUsd != null
                ? `$${Math.round(quote.grandUsd).toLocaleString("en-US")}`
                : "totalUk" in quote
                  ? `£${Math.round(quote.totalUk).toLocaleString("en-GB")}`
                  : "—"}
            </span>
          </p>
        ) : null}

        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Вес для разбора, кг (опционально)
          <input
            type="text"
            inputMode="decimal"
            placeholder="800 + 1.6×кг (UK)"
            value={dismantleKg}
            onChange={(e) => setDismantleKg(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
      </div>

      {quote ? (
        <div className="mt-6 border-t border-border pt-4" key={`${bidText}-${fxRate}-${dismantleKg}`}>
          <CopartQuoteDisplay quote={quote as CopartQuote} />
          <QuoteTotals quote={quote} region="uk" />
        </div>
      ) : null}
    </div>
  );
}

function AsiaListingPanel({ lot }: { lot: AuctionLot }) {
  const label = lot.region === "korea" ? "Цена Encar (≈ USD)" : "Цена с рынка Китая (≈ USD)";
  const catalogHref =
    lot.region === "korea" ? "/avto/korea/#lots" : "/avto/china/#lots";

  return (
    <div className="card-premium rounded-xl p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold">Цена лота</h2>
      <p className="mt-1 text-xs text-text-muted">
        Ориентир по рынку. Полный просчёт доставки и таможни — в калькуляторе.
      </p>

      <div className="mt-4 rounded-xl bg-gradient-to-r from-[#22c55e]/15 to-[#22c55e]/5 px-4 py-3 ring-1 ring-inset ring-[#22c55e]/30">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0D3F10]">
          {label}
        </p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums text-[#0D3F10]">
          {usd(lot.currentBid)}
        </p>
        {lot.buyNowPrice ? (
          <p className="mt-1 text-xs text-zinc-500">
            Buy Now · {usd(lot.buyNowPrice)}
          </p>
        ) : null}
      </div>

      <ul className="mt-4 space-y-1.5 text-sm text-text-secondary">
        <li>Регион: {lot.region === "korea" ? "Корея" : "Китай"}</li>
        <li>Локация: {lot.location || "—"}</li>
        <li>Год / пробег: {lot.year} · {lot.odometer.toLocaleString("ru-RU")} {lot.odometerUnit}</li>
      </ul>

      <div className="mt-5 flex flex-col gap-2">
        <a
          href="/calculator/"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#1B5E20] px-4 text-sm font-medium text-white hover:bg-[#0D3F10]"
        >
          Полный просчёт
        </a>
        <a
          href={catalogHref}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:border-zinc-500"
        >
          К каталогу лотов
        </a>
      </div>
    </div>
  );
}

export function LotCalculatorPanel({ lot }: Props) {
  if (lot.region === "usa") {
    return <UsaRestorationPanel lot={lot} />;
  }
  if (lot.region === "korea" || lot.region === "china") {
    return <AsiaListingPanel lot={lot} />;
  }
  return <UkKitPanel lot={lot} />;
}
