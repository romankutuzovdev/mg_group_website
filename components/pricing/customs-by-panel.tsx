"use client";

import { useEffect, useMemo, useState } from "react";
import { useRecordQuote } from "@/components/pricing/use-record-quote";
import {
  calculateCustomsBy,
  fetchNbrbRates,
  parseEngineCc,
  vehicleAgeBand,
  type AgeBand,
  type BynRates,
  type CustomsByResult,
  FALLBACK_BYN_RATES,
} from "@/lib/pricing/customs-by";

function byn(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} BYN`;
}

function usd(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function eur(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `€${value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

type Props = {
  priceUsd?: number | null;
  year?: number | null;
  engine?: string | null;
  fuel?: string | null;
  title?: string | null;
  onResult?: (result: CustomsByResult | null) => void;
  /** Писать просчёт в историю. В калькуляторе восстановления история пишется отдельно. */
  recordHistory?: boolean;
};

export function CustomsByPanel({
  priceUsd,
  year,
  engine,
  fuel,
  title,
  onResult,
  recordHistory = false,
}: Props) {
  const [ageBand, setAgeBand] = useState<"auto" | AgeBand>("auto");
  const [electric, setElectric] = useState(false);
  const [cc, setCc] = useState("");
  const [ccTouched, setCcTouched] = useState(false);
  const [benefit50, setBenefit50] = useState(false);
  const [includeEpts, setIncludeEpts] = useState(true);
  const [rates, setRates] = useState<BynRates>(FALLBACK_BYN_RATES);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    void fetchNbrbRates().then(setRates);
  }, []);

  useEffect(() => {
    if (ccTouched) return;
    const parsed = parseEngineCc(engine, title);
    if (parsed && parsed > 0) setCc(String(parsed));
  }, [engine, title, ccTouched]);

  const result: CustomsByResult | null = useMemo(() => {
    const price = Number(priceUsd);
    if (!Number.isFinite(price) || price <= 0) return null;
    return calculateCustomsBy({
      priceUsd: price,
      year: year ?? null,
      ageBand: ageBand === "auto" ? null : ageBand,
      engineType: electric ? "electric" : null,
      engineCc: Number(cc) > 0 ? Number(cc) : null,
      engine,
      fuel,
      title,
      benefit50,
      includeEpts,
      rates,
    });
  }, [priceUsd, year, ageBand, electric, cc, engine, fuel, title, benefit50, includeEpts, rates]);

  useEffect(() => {
    onResult?.(result);
  }, [result, onResult]);

  useRecordQuote(
    recordHistory && touched && result?.ok && result.totalUsd != null
      ? {
          kind: "customs",
          title: "Растаможка",
          bid: Number(priceUsd) || null,
          currency: "USD",
          total_usd: Math.round(result.totalUsd),
          summary: `Растаможка · ${year || "год не указан"} · ${cc || "объём не указан"} см³`,
        }
      : null,
  );

  const autoBand = vehicleAgeBand(year);

  return (
    <div className="space-y-4" onChange={() => setTouched(true)}>
      <div>
        <h3 className="font-display text-base font-semibold">Растаможка РБ</h3>
        <p className="mt-1 text-xs text-text-muted">
          ЕЭК №107 · утильсбор · курсы НБРБ
          {rates.source === "nbrb"
            ? ` (USD ${rates.USD.toFixed(2)}, EUR ${rates.EUR.toFixed(2)})`
            : " (ориентир)"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Возраст
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
            value={ageBand}
            onChange={(e) => setAgeBand(e.target.value as "auto" | AgeBand)}
          >
            <option value="auto">
              Авто{year ? ` (${autoBand === "under3" ? "<3" : autoBand === "over5" ? ">5" : "3–5"} лет)` : ""}
            </option>
            <option value="under3">Менее 3 лет</option>
            <option value="age3to5">От 3 до 5 лет</option>
            <option value="over5">Более 5 лет</option>
          </select>
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Объём, см³
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
            value={cc}
            onChange={(e) => {
              setCcTouched(true);
              setCc(e.target.value);
            }}
            placeholder="например 1998"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={electric} onChange={(e) => setElectric(e.target.checked)} />
          Электромобиль (пошлина 0)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={benefit50} onChange={(e) => setBenefit50(e.target.checked)} />
          Льгота 50% (Указ №140)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeEpts}
            onChange={(e) => setIncludeEpts(e.target.checked)}
          />
          ЭПТС ({EPTS_HINT})
        </label>
      </div>

      {!priceUsd || priceUsd <= 0 ? (
        <p className="text-sm text-text-muted">Сначала посчитайте доставку — таможня от суммы США.</p>
      ) : result && !result.ok ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {result.error}
        </p>
      ) : result?.ok ? (
        <dl className="space-y-2 border-t border-border pt-3 text-sm">
          <Row label="Таможенная стоимость" value={eur(result.customsValueEur)} />
          <Row
            label="Единый платёж"
            value={byn(result.dutyByn)}
            hint={result.dutyNote}
          />
          <Row label="Утильсбор" value={byn(result.utilFeeByn)} />
          <Row label="Таможенные операции" value={byn(result.customsOpsFeeByn)} />
          {result.eptsFeeByn > 0 ? <Row label="ЭПТС" value={byn(result.eptsFeeByn)} /> : null}
          <Row label="Итого таможня" value={byn(result.totalByn)} total />
          <Row label="≈ в USD" value={usd(result.totalUsd, 0)} />
          {result.formula ? (
            <p className="pt-1 text-[11px] text-text-muted">{result.formula}</p>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

const EPTS_HINT = "80.4 BYN";

function Row({
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
      <dt className={total ? "text-text-primary" : "text-text-muted"}>
        {label}
        {hint ? <span className="mt-0.5 block text-[10px] font-normal text-text-muted">{hint}</span> : null}
      </dt>
      <dd className={total ? "font-display text-accent-dark" : "font-medium"}>{value}</dd>
    </div>
  );
}

export function customsUsdFromResult(result: CustomsByResult | null): number {
  if (!result?.ok || result.totalUsd == null) return 0;
  return Math.round(result.totalUsd);
}
