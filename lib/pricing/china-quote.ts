/**
 * Просчёт авто из Китая (che168 / Autohome Global).
 *
 * API отдаёт цену только в долларах, поэтому юани на сайте — пересчёт по курсу.
 * Итого $ = авто $ + доставка + комиссия. Таможня не входит.
 */

/** Сколько юаней за 1 USD. */
export const CNY_PER_USD = 7.1;

/** Пока доставка и комиссия не заданы, сумму «под ключ» не показываем: она была бы занижена. */
export const CHINA_DELIVERY_USD: number | null = null;
export const CHINA_COMMISSION_USD: number | null = null;

export type ChinaQuote = {
  carUsd: number;
  deliveryUsd: number;
  commissionUsd: number;
  totalUsd: number;
};

export function usdToCny(usd: number): number {
  return Math.round(usd * CNY_PER_USD);
}

/** Цена для клиента: «≈ 67 166 ¥». Знак ≈ потому, что это пересчёт, а не цена продавца. */
export function formatCny(usd: number): string {
  // Non-breaking spaces: the price never wraps the ¥ onto its own line.
  return `≈\u00a0${usdToCny(usd).toLocaleString("ru-RU")}\u00a0¥`;
}

export function quoteChina(priceUsd: number): ChinaQuote | null {
  const carUsd = Math.round(Number(priceUsd) || 0);
  if (!(carUsd > 0) || CHINA_DELIVERY_USD === null || CHINA_COMMISSION_USD === null) return null;
  return {
    carUsd,
    deliveryUsd: CHINA_DELIVERY_USD,
    commissionUsd: CHINA_COMMISSION_USD,
    totalUsd: carUsd + CHINA_DELIVERY_USD + CHINA_COMMISSION_USD,
  };
}
