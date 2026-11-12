"use client";

import { EstimateNotice } from "@/components/pricing/estimate-notice";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchNbrbRates, FALLBACK_BYN_RATES, type BynRates } from "@/lib/pricing/customs-by";
import {
  calculateCustoms,
  type CalcAge,
  type CalcEngine,
  type CalcFuel,
  type CalcPerson,
  type CalcLine,
} from "@/lib/pricing/customs-calculator";

function money(value: number, currency: "EUR" | "BYN" | "USD", digits = 2) {
  const n = value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
  return currency === "EUR" ? `${n} €` : currency === "USD" ? `${n} $` : `${n} BYN`;
}

type Option<T extends string> = { value: T; label: string };

function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  vertical,
}: {
  label: string;
  hint?: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  vertical?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {label}
        {hint ? (
          <span title={hint} className="cursor-help text-stone-400">
            <Info className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{hint}</span>
          </span>
        ) : null}
      </legend>
      <div
        className={cn(
          "gap-1 rounded-xl bg-stone-100 p-1",
          vertical ? "grid" : "grid auto-cols-fr grid-flow-col",
        )}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              vertical ? "text-left" : "text-center",
              value === o.value
                ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
                : "text-stone-500 hover:text-stone-900",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
  suffix,
  invalid,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix: string;
  invalid?: boolean;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
        {label}
      </span>
      <span
        className={cn(
          "flex items-center rounded-xl border bg-white px-3 focus-within:ring-2 focus-within:ring-primary/40",
          invalid ? "border-red-400" : "border-stone-200",
        )}
      >
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-2.5 text-base text-stone-950 outline-none placeholder:text-stone-400"
        />
        <span className="pl-2 text-sm text-stone-400">{suffix}</span>
      </span>
    </label>
  );
}

const AGE_OPTIONS: Option<CalcAge>[] = [
  { value: "under3", label: "до 3 лет" },
  { value: "from3to5", label: "3–5 лет" },
  { value: "over5", label: "от 5 лет" },
];

const ENGINE_OPTIONS: Option<CalcEngine>[] = [
  { value: "fuel", label: "Топливо или гибрид PHEV" },
  { value: "electric", label: "Электро" },
  { value: "erev", label: "Гибрид EREV" },
];

const PERSON_OPTIONS: Option<CalcPerson>[] = [
  { value: "individual", label: "Физлицо" },
  { value: "company", label: "Юрлицо" },
];

const FUEL_OPTIONS: Option<CalcFuel>[] = [
  { value: "petrol", label: "Бензин" },
  { value: "diesel", label: "Дизель" },
];

export function CustomsCalculator() {
  const [age, setAge] = useState<CalcAge>("from3to5");
  const [price, setPrice] = useState("");
  const [engine, setEngine] = useState<CalcEngine>("fuel");
  const [person, setPerson] = useState<CalcPerson>("individual");
  const [fuel, setFuel] = useState<CalcFuel>("petrol");
  const [volume, setVolume] = useState("");
  const [delivery, setDelivery] = useState("");
  const [benefit50, setBenefit50] = useState(false);
  const [rates, setRates] = useState<BynRates>(FALLBACK_BYN_RATES);

  useEffect(() => {
    void fetchNbrbRates().then(setRates);
  }, []);

  const showVolume = engine === "fuel";
  const showFuel = engine === "fuel" && person === "company";
  const showBenefit = person === "individual" && engine !== "electric";

  const result = useMemo(
    () =>
      calculateCustoms({
        priceEur: Number(price),
        age,
        engine,
        person,
        fuel,
        volumeCc: Number(volume),
        benefit50: showBenefit && benefit50,
        deliveryEur: Number(delivery) || 0,
        rates: { EUR: rates.EUR, USD: rates.USD },
      }),
    [price, age, engine, person, fuel, volume, delivery, benefit50, showBenefit, rates],
  );

  const hasInput = price !== "" || volume !== "";

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <form
        className="space-y-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 lg:col-span-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <h2 className="font-display text-lg font-semibold text-stone-950">
          Калькулятор на 2026 год
        </h2>

        <NumberField
          id="calc-price"
          label="Стоимость авто"
          value={price}
          onChange={setPrice}
          placeholder="например 15000"
          suffix="€"
          invalid={hasInput && !result.ok && result.field === "price"}
        />

        <Segmented
          label="Возраст авто"
          hint="Считается от даты выпуска, а не первой регистрации. Для авто на топливе самые выгодные ставки — от 3 до 5 лет. Для электро от возраста зависит только утильсбор."
          value={age}
          options={AGE_OPTIONS}
          onChange={setAge}
        />

        <Segmented
          label="Тип двигателя"
          hint="Топливо или PHEV — авто с ДВС, в т.ч. подключаемые гибриды. Электро — только электромотор. EREV — едет всегда на электромоторе, бензиновый двигатель работает как генератор."
          value={engine}
          options={ENGINE_OPTIONS}
          onChange={setEngine}
          vertical
        />

        <Segmented
          label="Растаможивает"
          value={person}
          options={PERSON_OPTIONS}
          onChange={setPerson}
        />

        {showVolume || showFuel ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {showVolume ? (
              <NumberField
                id="calc-volume"
                label={
                  <>
                    Объём, см<sup>3</sup>
                  </>
                }
                value={volume}
                onChange={setVolume}
                placeholder="например 1998"
                suffix="см³"
                invalid={hasInput && !result.ok && result.field === "volume"}
              />
            ) : null}
            {showFuel ? (
              <Segmented label="Топливо" value={fuel} options={FUEL_OPTIONS} onChange={setFuel} />
            ) : null}
          </div>
        ) : null}

        <NumberField
          id="calc-delivery"
          label="Доставка до РБ (необязательно)"
          value={delivery}
          onChange={setDelivery}
          placeholder="0"
          suffix="€"
        />

        {showBenefit ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 text-sm text-stone-700 hover:bg-stone-50">
            <input
              type="checkbox"
              checked={benefit50}
              onChange={(e) => setBenefit50(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#22c55e]"
            />
            <span>
              <span className="font-medium text-stone-950">Таможенная льгота 50% (Указ №140)</span>
              <span className="block text-xs text-stone-500">
                Многодетные семьи, инвалиды I и II группы
              </span>
            </span>
          </label>
        ) : null}
      </form>

      <section
        aria-live="polite"
        className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 lg:col-span-3"
      >
        {result.ok ? (
          <ResultView result={result} rates={rates} />
        ) : (
          <EmptyState message={hasInput ? result.error : null} />
        )}
      </section>
    </div>
  );
}

function EmptyState({ message }: { message: string | null }) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 py-6">
      <h2 className="font-display text-xl font-semibold text-stone-950">
        Все таможенные платежи, пошлины и сборы
      </h2>
      {message ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message}
        </p>
      ) : (
        <p className="text-sm text-stone-500">
          Введите стоимость и объём двигателя — расчёт появится сразу.
        </p>
      )}
      <ul className="space-y-2 text-sm text-stone-600">
        {[
          "Актуальные ставки пошлин ЕАЭС на 2026 год",
          "Утилизационный сбор в редакции от 23.04.2026",
          "Электромобили и гибриды EREV",
          "Физические и юридические лица, льгота по Указу №140",
          "Пересчёт по курсу НБРБ на сегодня",
        ].map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultView({
  result,
  rates,
}: {
  result: Extract<ReturnType<typeof calculateCustoms>, { ok: true }>;
  rates: BynRates;
}) {
  const fmtLine = (l: CalcLine) => money(l.amount, l.currency);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-stone-950">Результат расчёта</h2>
        <p className="text-xs text-stone-500">{result.summary}</p>
      </div>

      <dl className="mt-4 divide-y divide-stone-100">
        {result.lines.map((l) => (
          <div key={l.key} className="flex items-start justify-between gap-4 py-2.5 text-sm">
            <dt className="text-stone-600">
              {l.label}
              {l.hint ? <span className="block text-xs text-stone-400">{l.hint}</span> : null}
            </dt>
            <dd className="whitespace-nowrap font-medium tabular-nums text-stone-950">
              {fmtLine(l)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-stone-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Растаможка</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-stone-950">
            {money(Math.round(result.clearanceByn), "BYN", 0)}
          </p>
          <p className="text-sm tabular-nums text-stone-500">
            ≈ {money(Math.round(result.clearanceEur), "EUR", 0)}
          </p>
        </div>
        <div className="rounded-xl bg-stone-950 p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Итого под ключ</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {money(Math.round(result.totalEur), "EUR", 0)}
          </p>
          <p className="text-sm tabular-nums text-white/60">
            или {money(Math.round(result.totalUsd), "USD", 0)} ·{" "}
            {money(Math.round(result.totalByn), "BYN", 0)}
          </p>
        </div>
      </div>

      <EstimateNotice className="mt-4" />

      <div className="mt-4 rounded-xl border border-stone-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Доп. услуги</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-stone-700">
          <li>*Эвакуатор от таможни до дверей клиента</li>
          <li>*Полное таможенное сопровождение</li>
        </ol>
        <p className="mt-2 text-xs text-stone-500">* В расчёт не входят, стоимость уточняйте у менеджера.</p>
      </div>

      <div className="mt-4 space-y-1 text-xs leading-relaxed text-stone-500">
        <p>
          Курс НБРБ{rates.source === "nbrb" ? " на сегодня" : " (ориентировочный, НБРБ недоступен)"}:
          1 EUR = {rates.EUR.toFixed(4)} BYN, 1 USD = {rates.USD.toFixed(4)} BYN.
        </p>
        <p>
          Суммы в валюте справочные: платежи на таможне вносятся в белорусских рублях по курсу НБРБ на
          день оплаты.
        </p>
      </div>
    </div>
  );
}
