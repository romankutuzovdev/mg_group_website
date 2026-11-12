export const FX_TRANSFER_MARKUP = 0.02;
/** Запасной мировой курс GBP→USD, если онлайн-курс недоступен */
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

/** Курс для расчёта: мировой + 0.02, округление вверх до сотых (1.3456 → 1.35). */
export function applyFxMarkup(marketRate: number): number {
  return Math.ceil(round4(marketRate + FX_TRANSFER_MARKUP) * 100 - 1e-9) / 100;
}

export const DEFAULT_FX: FxRateInfo = {
  marketRate: DEFAULT_MARKET_RATE,
  rate: applyFxMarkup(DEFAULT_MARKET_RATE),
  source: "fixed",
};

type FxSourceTry = { source: string; url: string; pick: (data: unknown) => number };

const FX_SOURCES: FxSourceTry[] = [
  {
    source: "ecb",
    url: "https://api.frankfurter.dev/v1/latest?base=GBP&symbols=USD",
    pick: (d) => Number((d as { rates?: { USD?: number } })?.rates?.USD),
  },
  {
    source: "er-api",
    url: "https://open.er-api.com/v6/latest/GBP",
    pick: (d) => Number((d as { rates?: { USD?: number } })?.rates?.USD),
  },
];

const FX_CACHE_TTL_MS = 30 * 60 * 1000;
let fxCache: { info: FxRateInfo; at: number } | null = null;
let fxInflight: Promise<FxRateInfo> | null = null;

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Мировой курс GBP→USD (ЕЦБ, запасной источник — open.er-api) + 0.02 на перевод. */
export async function fetchFxRateGbpUsd(): Promise<FxRateInfo> {
  if (fxCache && Date.now() - fxCache.at < FX_CACHE_TTL_MS) return fxCache.info;
  if (fxInflight) return fxInflight;
  fxInflight = (async () => {
    for (const src of FX_SOURCES) {
      try {
        const market = src.pick(await fetchJson(src.url, 4000));
        if (Number.isFinite(market) && market > 0.5 && market < 3) {
          const info: FxRateInfo = {
            marketRate: round4(market),
            rate: applyFxMarkup(market),
            source: src.source,
          };
          fxCache = { info, at: Date.now() };
          return info;
        }
      } catch {
        // следующий источник
      }
    }
    return DEFAULT_FX;
  })().finally(() => {
    fxInflight = null;
  });
  return fxInflight;
}
