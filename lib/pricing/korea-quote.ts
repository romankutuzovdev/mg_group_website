/**
 * Просчёт авто из Кореи (Encar).
 *
 * Стоимость авто $ = цена_KRW / курс_USDT(빗썸)
 * Итого $ = авто $ + доставка 3750 + сбор Encar 530
 *
 * Курс: Bithumb USDT/KRW (= Naver «빗썸테더»).
 */

export const KOREA_DELIVERY_USD = 3750;
export const KOREA_ENCAR_FEE_USD = 530;
/** Fallback, если API курса недоступен (≈ вчерашний Bithumb). */
export const DEFAULT_KRW_PER_USDT = 1343;

export type KoreaQuoteInput = {
  /** Цена лота в вонаx (полная, не 만원). */
  priceKrw: number;
  /** Сколько вон за 1 USDT (Bithumb). */
  krwPerUsdt: number;
};

export type KoreaQuote = {
  priceKrw: number;
  krwPerUsdt: number;
  carUsd: number;
  deliveryUsd: number;
  encarFeeUsd: number;
  totalUsd: number;
};

export function roundMoney(n: number): number {
  return Math.round(n);
}

/** Цена авто в USD по курсу Bithumb. */
export function krwToUsd(priceKrw: number, krwPerUsdt: number): number {
  const rate = krwPerUsdt > 0 ? krwPerUsdt : DEFAULT_KRW_PER_USDT;
  if (!(priceKrw > 0)) return 0;
  return priceKrw / rate;
}

export function quoteKorea(input: KoreaQuoteInput): KoreaQuote | null {
  const priceKrw = Number(input.priceKrw) || 0;
  if (!(priceKrw > 0)) return null;
  const krwPerUsdt =
    input.krwPerUsdt > 0 ? input.krwPerUsdt : DEFAULT_KRW_PER_USDT;
  const carUsd = roundMoney(krwToUsd(priceKrw, krwPerUsdt));
  const deliveryUsd = KOREA_DELIVERY_USD;
  const encarFeeUsd = KOREA_ENCAR_FEE_USD;
  return {
    priceKrw: roundMoney(priceKrw),
    krwPerUsdt: Math.round(krwPerUsdt * 100) / 100,
    carUsd,
    deliveryUsd,
    encarFeeUsd,
    totalUsd: carUsd + deliveryUsd + encarFeeUsd,
  };
}
