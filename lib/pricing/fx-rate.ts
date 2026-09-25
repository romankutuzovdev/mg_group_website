export const FX_TRANSFER_MARKUP = 0.02;
/** Фиксированный мировой курс GBP→USD */
const DEFAULT_MARKET_RATE = 1.36;

export type FxRateInfo = {
  /** Мировой курс GBP→USD */
  marketRate: number;
  /** Курс для расчёта: market + 0.02 на перевод */
  rate: number;
  source: string;
};

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function applyFxMarkup(marketRate: number): number {
  return round4(marketRate + FX_TRANSFER_MARKUP);
}

export const DEFAULT_FX: FxRateInfo = {
  marketRate: DEFAULT_MARKET_RATE,
  rate: applyFxMarkup(DEFAULT_MARKET_RATE),
  source: "fixed",
};

/** Фиксированный курс: 1.36 + 0.02 = 1.38 */
export async function fetchFxRateGbpUsd(): Promise<FxRateInfo> {
  return DEFAULT_FX;
}
