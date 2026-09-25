"use client";

import { DEFAULT_FX, type FxRateInfo } from "@/lib/pricing/fx-rate";

export { DEFAULT_FX };

/** Фиксированный курс GBP→USD: 1.36 + 0.02 */
export function useFxRate(): FxRateInfo {
  return DEFAULT_FX;
}

export function parseBidInput(text: string): number {
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  if (!normalized || normalized === ".") return 0;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}
