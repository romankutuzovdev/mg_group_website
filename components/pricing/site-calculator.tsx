"use client";

import { useState } from "react";
import Link from "next/link";
import { CalculatorForm } from "@/components/pricing/calculator-form";
import { RestorationCalculator } from "@/components/pricing/restoration-calculator";
import { CustomsByPanel } from "@/components/pricing/customs-by-panel";
import { cn } from "@/lib/utils";

export type CalculatorMode = "kits" | "car" | "customs";

const MODES: { id: CalculatorMode; label: string; href: string; blurb: string }[] = [
  {
    id: "kits",
    label: "Машинокомплект",
    href: "/calculator/mashinokomplekt/",
    blurb: "США / Англия: ставка, сборы, доставка и разбор — как в боте MG.GROUP.",
  },
  {
    id: "car",
    label: "Авто под восстановление",
    href: "/calculator/vosstanovlenie/",
    blurb: "Целое авто: Bid.cars / IAAI / Copart, доставка Klaipeda·Poti и растаможка РБ.",
  },
  {
    id: "customs",
    label: "Растаможка РБ",
    href: "/calculator/?mode=customs",
    blurb: "Только таможенный платёж по правилам РБ.",
  },
];

type Props = {
  /** Active calculator (как вкладки в боте) */
  mode?: CalculatorMode;
  /** Show mode switcher */
  showSwitcher?: boolean;
  /** Kit form: start on USA or UK */
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

/**
 * Public site calculator — same split as Telegram bot / cabinet CRM:
 * машинокомплект | авто под восстановление | растаможка.
 */
export function SiteCalculator({
  mode: modeProp = "car",
  showSwitcher = true,
  kitDefaultTab = "usa",
}: Props) {
  const [mode, setMode] = useState<CalculatorMode>(modeProp);

  return (
    <div className="space-y-5">
      {showSwitcher ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-zinc-50 p-1">
            {MODES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className={cn(
                  "min-h-11 flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition sm:flex-none sm:px-4",
                  mode === t.id
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-text-secondary hover:text-zinc-900",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            {MODES.find((m) => m.id === mode)?.blurb}{" "}
            {mode !== "customs" ? (
              <>
                Отдельная страница:{" "}
                <Link
                  href={MODES.find((m) => m.id === mode)!.href}
                  className="font-medium text-accent-dark underline underline-offset-2"
                >
                  открыть →
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {mode === "kits" ? (
        <div className="space-y-3">
          {!showSwitcher ? (
            <p className="text-sm text-text-secondary">
              Просчёт машинокомплекта: сборы аукциона, доставка и разбор (США / Англия).
            </p>
          ) : null}
          <CalculatorForm defaultTab={kitDefaultTab} />
        </div>
      ) : null}

      {mode === "car" ? (
        <div className="space-y-3">
          {!showSwitcher ? (
            <p className="text-sm text-text-secondary">
              Целое авто под восстановление: ставка, доставка и таможня РБ.
            </p>
          ) : null}
          <RestorationCalculator />
        </div>
      ) : null}

      {mode === "customs" ? <CustomsStandalone /> : null}
    </div>
  );
}
