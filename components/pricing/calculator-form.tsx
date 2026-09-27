"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CopartQuote } from "@/lib/pricing/copart-uk";
import type { IaaiQuote } from "@/lib/pricing/iaai-usa";
import {
  listUkDeliveryLocations,
  resolveRegion,
  VEHICLE_TYPE_OPTIONS,
} from "@/lib/pricing";
import { CopartQuoteDisplay, IaaiQuoteDisplay } from "@/components/pricing/quote-display";
import { computeCalculatorQuote, QuoteTotals } from "@/components/pricing/live-quote";
import { parseBidInput, useFxRate } from "@/components/pricing/use-fx-rate";
import { fetchLotFromUrl, type LotFromUrlResponse } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import { LotLoadButton, LotLoadStatus, lotLoadErrorMessage } from "@/components/pricing/lot-url-load";

type Tab = "uk" | "usa";

const UK_LOCATIONS = listUkDeliveryLocations();
const BODY_VALUES = new Set<string>(VEHICLE_TYPE_OPTIONS.map((opt) => opt.value));

function kitMarket(url: string, lot: LotFromUrlResponse): Tab {
  const hay = `${url} ${lot.url || ""} ${lot.source || ""} ${lot.region || ""}`.toLowerCase();
  if (lot.region === "uk" || lot.source === "copart_uk" || hay.includes("copart.co.uk")) return "uk";
  return "usa";
}

function matchBody(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  if (BODY_VALUES.has(t)) return t;
  const low = t.toLowerCase();
  if (/motor|bike|quad|atv|мото/.test(low)) return "motorcycle";
  if (/van|bus|sprinter|minivan|фургон/.test(low)) return "van";
  if (/pickup|truck|пикап/.test(low)) return "pickup";
  if (/suv|crossover|jeep|wagon|джип|кроссовер/.test(low)) return "SUV";
  if (/sedan|hatch|coupe|saloon|седан/.test(low)) return "sedan";
  return null;
}

function matchCategory(lot: LotFromUrlResponse): string {
  const explicit = (lot.category || "").trim().toUpperCase();
  if (explicit === "A" || explicit === "B") return explicit;
  const hay = `${lot.category || ""} ${lot.title || ""}`;
  const m = hay.match(/\bcat(?:egory)?\s*([AB])\b/i);
  return m ? m[1].toUpperCase() : "";
}

type Props = {
  /** Стартовый рынок в калькуляторе */
  defaultTab?: Tab;
  /** Скрыть переключатель рынков (на отдельных SEO-страницах) */
  hideTabs?: boolean;
  /** Когда ссылка сама переключает Англию и США */
  onMarketChange?: (tab: Tab) => void;
};

export function CalculatorForm({ defaultTab = "uk", hideTabs = false, onMarketChange }: Props) {
  const fx = useFxRate();
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [bidText, setBidText] = useState("5000");
  const [location, setLocation] = useState("WHITBURN");
  const [category, setCategory] = useState("");
  const [inlandMilesText, setInlandMilesText] = useState("450");
  const [bodyStyle, setBodyStyle] = useState("SUV");
  const [lotUrl, setLotUrl] = useState("");
  const [lotLoading, setLotLoading] = useState(false);
  const [lotError, setLotError] = useState<string | null>(null);
  const [lotMeta, setLotMeta] = useState<string | null>(null);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const loadFromUrl = useCallback(async () => {
    const url = lotUrl.trim();
    if (!url) {
      setLotError("Вставьте ссылку Copart, Copart UK, IAAI или Bid.cars");
      return;
    }
    if (!isApiEnabled()) {
      setLotError("API недоступен");
      return;
    }
    setLotLoading(true);
    setLotError(null);
    setLotMeta(null);
    try {
      const lot = await fetchLotFromUrl(url);
      const market = kitMarket(url, lot);
      setTab(market);
      onMarketChange?.(market);
      if (lot.bid != null && Number(lot.bid) > 0) {
        setBidText(String(Math.round(Number(lot.bid))));
      }
      const body = matchBody(lot.bodyStyle) || matchBody(lot.model);
      if (body) setBodyStyle(body);
      if (market === "uk") {
        const yard = resolveRegion(lot.location);
        if (yard && yard !== "DEFAULT") setLocation(yard);
        setCategory(matchCategory(lot));
      } else if (lot.inlandMiles != null && Number(lot.inlandMiles) > 0) {
        setInlandMilesText(String(Math.round(Number(lot.inlandMiles))));
      }
      const label = [lot.year, lot.make, lot.model, lot.lotNumber && `#${lot.lotNumber}`]
        .filter(Boolean)
        .join(" ");
      const place = lot.location ? ` · ${lot.location}` : "";
      setLotMeta(
        `${label || "Лот загружен"}${place} · ${market === "uk" ? "Англия" : "США"}`,
      );
    } catch (err) {
      setLotError(lotLoadErrorMessage(err));
    } finally {
      setLotLoading(false);
    }
  }, [lotUrl, onMarketChange]);

  const bid = parseBidInput(bidText);
  const fxRate = fx.rate;
  const fxMarketRate = fx.marketRate;

  const quote = useMemo(
    () =>
      computeCalculatorQuote(tab, bidText, { ...fx, rate: fxRate, marketRate: fxMarketRate }, {
        location,
        category,
        bodyStyle,
        vatOnSale: false,
        inlandMilesText,
      }),
    [tab, bidText, fx, fxRate, fxMarketRate, location, category, bodyStyle, inlandMilesText],
  );

  return (
    <div>
      {!hideTabs ? (
        <div className="mb-6 flex gap-2 rounded-lg border border-border bg-bg-base p-1">
          {(
            [
              ["uk", "Англия"],
              ["usa", "США"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-11 flex-1 rounded-md px-3 py-2 text-sm font-medium transition sm:px-4 ${
                tab === key ? "bg-accent-dark text-white" : "text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="card-premium space-y-4 rounded-xl p-4 sm:p-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Ссылка на лот (Copart / Copart UK / IAAI / Bid.cars)
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={lotUrl}
                onChange={(e) => setLotUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void loadFromUrl();
                  }
                }}
                placeholder="https://www.copart.com/lot/… или https://www.copart.co.uk/lot/…"
                className="w-full flex-1 rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
              />
              <LotLoadButton loading={lotLoading} onClick={() => void loadFromUrl()} />
            </div>
            <LotLoadStatus active={lotLoading} />
            {lotError ? (
              <p className="mt-1.5 text-xs font-normal normal-case tracking-normal text-red-600">
                {lotError}
              </p>
            ) : null}
            {lotMeta ? (
              <p className="mt-1.5 text-xs font-normal normal-case tracking-normal text-emerald-700">
                {lotMeta}
              </p>
            ) : null}
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Ваша ставка ({tab === "uk" ? "GBP" : "USD"})
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
              Расчёт для {tab === "uk" ? "£" : "$"}
              {bid.toLocaleString("ru-RU")} →{" "}
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
            Тип авто
            <select
              value={bodyStyle}
              onChange={(e) => setBodyStyle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
            >
              {VEHICLE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {tab === "uk" ? (
            <>
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
                Площадка (регион UK)
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
                >
                  {UK_LOCATIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  <option value="DEFAULT">DEFAULT (прочее)</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
                Категория
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
                >
                  <option value="">—</option>
                  <option value="B">Cat B</option>
                  <option value="A">Cat A</option>
                </select>
              </label>
            </>
          ) : (
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Мили до порта США ($1/mi)
              <input
                type="text"
                inputMode="numeric"
                value={inlandMilesText}
                onChange={(e) => setInlandMilesText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              />
            </label>
          )}
        </div>

        <div className="card-premium rounded-xl p-6" key={`${tab}-${bidText}-${fxRate}`}>
          {tab === "uk" && quote ? <CopartQuoteDisplay quote={quote as CopartQuote} /> : null}
          {tab === "usa" && quote ? <IaaiQuoteDisplay quote={quote as IaaiQuote} /> : null}
          {quote ? <QuoteTotals quote={quote} region={tab} /> : null}
        </div>
      </div>
    </div>
  );
}
