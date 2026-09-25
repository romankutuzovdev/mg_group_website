"use client";

import { useEffect, useMemo, useState } from "react";
import { CalculatorForm } from "@/components/pricing/calculator-form";
import { RestorationCalculator } from "@/components/pricing/restoration-calculator";
import { CustomsByPanel } from "@/components/pricing/customs-by-panel";
import { CopartQuoteDisplay, IaaiQuoteDisplay } from "@/components/pricing/quote-display";
import { QuoteTotals } from "@/components/pricing/live-quote";
import { parseBidInput, useFxRate } from "@/components/pricing/use-fx-rate";
import {
  listUkDeliveryLocations,
  VEHICLE_TYPE_OPTIONS,
} from "@/lib/pricing";
import type { CopartQuote } from "@/lib/pricing/copart-uk";
import type { IaaiQuote } from "@/lib/pricing/iaai-usa";
import { fetchQuote } from "@/lib/api/client";
import { getApiBaseUrl, isApiEnabled } from "@/lib/api/config";

type Mode = "kits" | "car" | "customs";
type KitTab = "uk" | "usa";

const UK_LOCATIONS = listUkDeliveryLocations();

/**
 * Cabinet calculator — same modes as MG Group bot CRM:
 * kits (Copart UK / IAAI USA), whole-car restoration, customs BY.
 * Kit quotes go through the server API when NEXT_PUBLIC_API_URL is set.
 */
export function CabinetCalculator() {
  const [mode, setMode] = useState<Mode>("kits");
  const apiBase = getApiBaseUrl();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Калькулятор просчёта</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Как в CRM MG.GROUP: машинокомплекты, авто под восстановление, растаможка РБ.
            {apiBase ? (
              <>
                {" "}
                Сервер:{" "}
                <a
                  href={`${apiBase}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent-dark underline underline-offset-2"
                >
                  {apiBase}/docs
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-zinc-50 p-1">
        {(
          [
            { id: "kits" as const, label: "Машинокомплект" },
            { id: "car" as const, label: "Авто под восстановление" },
            { id: "customs" as const, label: "Растаможка РБ" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
              mode === t.id
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-text-secondary hover:text-zinc-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "kits" ? (
        isApiEnabled() ? <ServerKitCalculator /> : <CalculatorForm />
      ) : null}
      {mode === "car" ? <RestorationCalculator /> : null}
      {mode === "customs" ? (
        <div className="rounded-xl border border-border bg-white p-4 sm:p-5">
          <CustomsStandalone />
        </div>
      ) : null}
    </div>
  );
}

function CustomsStandalone() {
  const [price, setPrice] = useState("12000");
  const [year, setYear] = useState("2018");
  const [engine, setEngine] = useState("2.0");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Цена авто (USD)
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Год
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Двигатель
          <input
            type="text"
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
      </div>
      <CustomsByPanel
        priceUsd={Number(price) || null}
        year={Number(year) || null}
        engine={engine}
      />
    </div>
  );
}

function ServerKitCalculator() {
  const fx = useFxRate();
  const [tab, setTab] = useState<KitTab>("uk");
  const [bidText, setBidText] = useState("5000");
  const [location, setLocation] = useState("WHITBURN");
  const [category, setCategory] = useState("");
  const [inlandMilesText, setInlandMilesText] = useState("450");
  const [bodyStyle, setBodyStyle] = useState("SUV");
  const [quote, setQuote] = useState<CopartQuote | IaaiQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bid = parseBidInput(bidText);
  const inlandMiles = Number(inlandMilesText) || undefined;

  const payload = useMemo(
    () => ({
      region: tab === "uk" ? ("uk" as const) : ("usa" as const),
      bid,
      location: tab === "uk" ? location : undefined,
      category: tab === "uk" ? category || undefined : undefined,
      body_style: bodyStyle,
      inland_miles: tab === "usa" ? inlandMiles : undefined,
      fx_rate: tab === "uk" ? fx.rate : undefined,
      volume: "high" as const,
      bid_method: "live" as const,
    }),
    [tab, bid, location, category, bodyStyle, inlandMiles, fx.rate],
  );

  useEffect(() => {
    if (!bid || bid <= 0) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void fetchQuote(payload)
        .then((res) => {
          if (cancelled) return;
          setQuote(res.quote as CopartQuote | IaaiQuote);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setQuote(null);
          setError(err instanceof Error ? err.message : "Ошибка расчёта на сервере");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [payload]);

  return (
    <div>
      <div className="mb-4 flex gap-2 rounded-lg border border-border bg-bg-base p-1">
        {(
          [
            ["uk", "Англия (Copart UK)"],
            ["usa", "США (IAAI / комплекты)"],
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

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3 rounded-xl border border-border bg-white p-4 sm:p-5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Ставка ({tab === "uk" ? "GBP" : "USD"})
            <input
              type="number"
              min={0}
              step={1}
              value={bidText}
              onChange={(e) => setBidText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-lg font-semibold"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Тип авто
            <select
              value={bodyStyle}
              onChange={(e) => setBodyStyle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
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
                Площадка UK
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
                >
                  {UK_LOCATIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  <option value="DEFAULT">DEFAULT</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
                Категория
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
                >
                  <option value="">—</option>
                  <option value="B">Cat B</option>
                  <option value="A">Cat A</option>
                </select>
              </label>
              {fx.rate ? (
                <p className="text-[11px] text-text-muted">
                  Курс GBP→USD для расчёта: {fx.rate.toFixed(4)}
                </p>
              ) : null}
            </>
          ) : (
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Мили до порта США
              <input
                type="text"
                inputMode="numeric"
                value={inlandMilesText}
                onChange={(e) => setInlandMilesText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
              />
            </label>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white p-4 sm:p-5">
          {loading ? <p className="text-sm text-text-muted">Считаем на сервере…</p> : null}
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {!loading && !error && tab === "uk" && quote ? (
            <CopartQuoteDisplay quote={quote as CopartQuote} />
          ) : null}
          {!loading && !error && tab === "usa" && quote ? (
            <IaaiQuoteDisplay quote={quote as IaaiQuote} />
          ) : null}
          {!loading && quote ? <QuoteTotals quote={quote} region={tab} /> : null}
          {!loading && !quote && !error ? (
            <p className="text-sm text-text-muted">Введите ставку для расчёта.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
