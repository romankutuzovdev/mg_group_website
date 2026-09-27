"use client";

import { useState } from "react";
import Link from "next/link";
import { CalculatorForm } from "@/components/pricing/calculator-form";
import { RestorationCalculator } from "@/components/pricing/restoration-calculator";
import { CustomsByPanel } from "@/components/pricing/customs-by-panel";
import { cn } from "@/lib/utils";

export type CalculatorMode = "kit-uk" | "kit-usa" | "car" | "customs";

const MODES: {
  id: Exclude<CalculatorMode, "customs">;
  label: string;
  href: string;
  blurb: string;
}[] = [
  {
    id: "kit-uk",
    label: "Комплект · Англия",
    href: "/calculator/mashinokomplekt/",
    blurb:
      "Машинокомплект Copart UK: ставка в фунтах, аукционные сборы, доставка с площадки и разбор.",
  },
  {
    id: "kit-usa",
    label: "Комплект · США",
    href: "/calculator/mashinokomplekt/",
    blurb:
      "Машинокомплект IAAI / Copart USA: ставка в долларах, сборы, мили до порта и разбор.",
  },
  {
    id: "car",
    label: "Авто под восстановление",
    href: "/calculator/vosstanovlenie/",
    blurb:
      "Другая формула: целое авто без разбора, сбор по ставке, доставка Klaipeda или Poti и таможня РБ.",
  },
];

type Props = {
  /** Active calculator (как вкладки в боте) */
  mode?: CalculatorMode;
  /** Show mode switcher */
  showSwitcher?: boolean;
  /** Kit form: start on USA or UK when mode is a kit */
  kitDefaultTab?: "uk" | "usa";
};

function CustomsStandalone() {
  const [price, setPrice] = useState("12000");
  const [year, setYear] = useState("2018");
  const [engine, setEngine] = useState("2.0");
  return (
    <div className="space-y-4 rounded-xl border border-border bg-white p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Цена авто (USD)
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Год
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Двигатель
          <input
            type="text"
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
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

function kitTabFromMode(mode: CalculatorMode, fallback: "uk" | "usa"): "uk" | "usa" {
  if (mode === "kit-usa") return "usa";
  if (mode === "kit-uk") return "uk";
  return fallback;
}

/**
 * Public site calculator — same split as the desktop bot:
 * машинокомплект Англия, машинокомплект США, авто под восстановление.
 */
export function SiteCalculator({
  mode: modeProp = "kit-uk",
  showSwitcher = true,
  kitDefaultTab = "uk",
}: Props) {
  const [mode, setMode] = useState<CalculatorMode>(modeProp);
  const active = MODES.find((item) => item.id === mode) ?? MODES[0];
  const kitTab = kitTabFromMode(mode, kitDefaultTab);

  return (
    <div className="space-y-5">
      {showSwitcher ? (
        <div className="space-y-2">
          <div className="grid gap-1.5 rounded-xl border border-border bg-zinc-50 p-1 sm:grid-cols-3">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={cn(
                  "min-h-11 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                  mode === item.id
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-text-secondary hover:text-zinc-900",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-text-secondary">{active.blurb}</p>
        </div>
      ) : null}

      {mode === "kit-uk" || mode === "kit-usa" ? (
        <CalculatorForm
          defaultTab={kitTab}
          hideTabs={showSwitcher}
          onMarketChange={(tab) => setMode(tab === "uk" ? "kit-uk" : "kit-usa")}
        />
      ) : null}

      {mode === "car" ? <RestorationCalculator /> : null}

      {mode === "customs" ? <CustomsStandalone /> : null}

      {showSwitcher && mode !== "customs" ? (
        <p className="text-xs text-text-muted">
          Отдельная страница:{" "}
          <Link
            href={active.href}
            className="font-medium text-accent-dark underline underline-offset-2"
          >
            открыть →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
