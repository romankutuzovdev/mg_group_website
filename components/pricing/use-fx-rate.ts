"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FX, fetchFxRateGbpUsd, type FxRateInfo } from "@/lib/pricing/fx-rate";

export { DEFAULT_FX };

/** Курс GBP→USD: мировой + 0.02. Пока грузится — запасной курс. */
export function useFxRate(): FxRateInfo {
  const [fx, setFx] = useState<FxRateInfo>(DEFAULT_FX);
  useEffect(() => {
    let cancelled = false;
    void fetchFxRateGbpUsd().then((info) => {
      if (!cancelled) setFx(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return fx;
}

export function parseBidInput(text: string): number {
  const normalized = text.replace(/\s/g, "").replace(",", ".");
  if (!normalized || normalized === ".") return 0;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}
