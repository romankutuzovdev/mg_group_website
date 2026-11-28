/** Снимки публичных лотов и ответов /api/v1/pricing/quote от 28.11.2026. */
export type KitOrigin = "usa" | "uk";
type Currency = "USD" | "GBP";

type KitQuoteExample = {
  title: string;
  source: string;
  lotNumber: string;
  date: string;
  assumptions: string;
  lines: Array<[string, number, Currency]>;
  totalUsd: number;
};

export const KIT_EXAMPLES: Record<KitOrigin, KitQuoteExample> = {
  // Public catalog source: /api/v1/lots/bidcars-2022-toyota-camry-0-46224457
  usa: {
    title: "Toyota Camry 2022 из США",
    source: "Bid.cars",
    lotNumber: "0-46224457",
    date: "28.11.2026",
    assumptions: "В расчёте MG.GROUP для седана из Хьюстона приняли условную ставку 7 000 USD, стандартные сборы IAAI и 200 USD на перевозку до разборки. Платные дополнения к бланку не выбраны.",
    lines: [
      ["Условная ставка", 7000, "USD"],
      ["Аукционные сборы", 1185, "USD"],
      ["Перевозка по США", 200, "USD"],
      ["Комиссия за перевод", 293.48, "USD"],
      ["Выкуп и диспетчирование", 200, "USD"],
      ["Разбор, таможня и доставка до Минска", 4100, "USD"],
    ],
    totalUsd: 12978.48,
  },
  // Public catalog source: /api/v1/lots/copart-uk-2019-ford-focus-76501756
  uk: {
    title: "Ford Focus 2019 из Англии",
    source: "Copart UK",
    lotNumber: "76501756",
    date: "28.11.2026",
    assumptions: "В расчёте MG.GROUP для легкового автомобиля категории N в Бристоле приняли условную ставку 1 500 GBP и курс 1 GBP = 1,30 USD. НДС в этом примере начислен только на сборы.",
    lines: [
      ["Условная ставка", 1500, "GBP"],
      ["Аукционные сборы с НДС", 436.8, "GBP"],
      ["Перевозка по Англии", 300, "GBP"],
      ["Комиссия за перевод", 78.29, "GBP"],
      ["Разбор, таможня и доставка до Минска", 2250, "USD"],
    ],
    totalUsd: 5259.62,
  },
};

export function formatCaseMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
