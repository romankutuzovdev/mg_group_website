import { apiUrl, isApiEnabled } from "@/lib/api/config";
import {
  DEFAULT_KRW_PER_USDT,
} from "@/lib/pricing/korea-quote";

export type KrwUsdtRateInfo = {
  /** Вон за 1 USDT (Bithumb / Naver 빗썸테더). */
  rate: number;
  source: string;
  asOf?: string;
};

export const DEFAULT_KRW_USDT: KrwUsdtRateInfo = {
  rate: DEFAULT_KRW_PER_USDT,
  source: "default",
};

/**
 * Курс KRW/USDT с нашего API (Bithumb ticker = тот же источник, что Naver «빗썸테더»).
 */
export async function fetchKrwUsdtRate(): Promise<KrwUsdtRateInfo> {
  if (!isApiEnabled()) return DEFAULT_KRW_USDT;
  try {
    const res = await fetch(apiUrl("/api/v1/pricing/fx/krw-usdt"), {
      cache: "no-store",
    });
    if (!res.ok) return DEFAULT_KRW_USDT;
    const data = (await res.json()) as {
      rate?: number;
      source?: string;
      asOf?: string;
    };
    const rate = Number(data.rate);
    if (!(rate > 500 && rate < 5000)) return DEFAULT_KRW_USDT;
    return {
      rate,
      source: data.source || "bithumb",
      asOf: data.asOf,
    };
  } catch {
    return DEFAULT_KRW_USDT;
  }
}
