"use client";

import { priceByWeight, WEIGHT_FORMULA, type CommercialOrigin } from "@/lib/pricing/commercial";

export const DISMANTLE_KG_MIN = 400;
export const DISMANTLE_KG_MAX = 2000;
export const DISMANTLE_KG_DEFAULT = 1500;

export function clampDismantleKg(value: number): number {
  if (!Number.isFinite(value)) return DISMANTLE_KG_DEFAULT;
  return Math.min(DISMANTLE_KG_MAX, Math.max(DISMANTLE_KG_MIN, Math.round(value)));
}

export function WeightDismantleControl({
  origin,
  kg,
  onChange,
}: {
  origin: CommercialOrigin;
  kg: number;
  onChange: (kg: number) => void;
}) {
  const formula = WEIGHT_FORMULA[origin];
  const price = priceByWeight(origin, kg);
  const perKg = formula.perKg.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="rounded-lg border border-border bg-bg-base px-3 py-3">
      <div className="flex items-end justify-between gap-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Вес, кг
          <input
            type="number"
            min={DISMANTLE_KG_MIN}
            max={DISMANTLE_KG_MAX}
            step={10}
            value={kg}
            onChange={(e) => onChange(clampDismantleKg(Number(e.target.value)))}
            className="mt-1 w-28 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-text-primary"
          />
        </label>
        <p className="pb-2 text-right text-sm">
          <span className="block text-xs text-text-muted">
            {formula.base.toLocaleString("ru-RU")} + {perKg} × {kg.toLocaleString("ru-RU")} кг
          </span>
          <span className="font-display text-lg font-bold text-accent-dark">
            ${price.toLocaleString("en-US")}
          </span>
        </p>
      </div>
      <input
        type="range"
        min={DISMANTLE_KG_MIN}
        max={DISMANTLE_KG_MAX}
        step={10}
        value={kg}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Вес для разбора, килограммы"
        className="mt-3 h-2 w-full cursor-pointer accent-accent-dark"
      />
      <div className="mt-1 flex justify-between text-[11px] text-text-muted">
        <span>{DISMANTLE_KG_MIN} кг</span>
        <span>{DISMANTLE_KG_MAX.toLocaleString("ru-RU")} кг</span>
      </div>
    </div>
  );
}
