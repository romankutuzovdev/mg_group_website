/**
 * Дополнительный сервис и страхование для «авто под восстановление» (прайс США).
 */

export type ExtraService = {
  id: string;
  label: string;
  usd: number;
  description: string;
  /** Цена за штуку — у услуги есть количество. */
  unit?: string;
};

export const EXTRA_SERVICES: ExtraService[] = [
  {
    id: "photos",
    label: "Дополнительные фото",
    usd: 50,
    description:
      "Фото сломанных деталей в салоне, под капотом, внутри багажника (также доп. фото по комментарию)",
  },
  {
    id: "film",
    label: "Плёнка на элементе",
    usd: 30,
    unit: "окно",
    description:
      "Закрыть пластиковой лентой разбитые окна, багажник, люк и т. д., чтобы внутрь не попала вода. Цена за окно",
  },
  {
    id: "absorbers",
    label: "Поглотители влаги",
    usd: 40,
    unit: "пакет",
    description:
      "Цена за 1 пакет. Для Water/Flood рекомендуем 5 шт. (переднее сиденье 2, заднее 2 + багажник)",
  },
  {
    id: "engine",
    label: "Проверка запуска двигателя",
    usd: 50,
    description: "Проверка запуска двигателя при помощи бустера",
  },
  {
    id: "seatCover",
    label: "Чехол на сиденье",
    usd: 20,
    unit: "шт.",
    description: "Чехол на сиденье автомобиля. Цена за 1 шт.",
  },
  {
    id: "premiumWrap",
    label: "Премиум покрытие авто",
    usd: 200,
    description: "Замотать машину в плёнку перед отправкой, чтобы избежать мелких царапин/повреждений",
  },
  {
    id: "basicWrap",
    label: "Обычное покрытие авто",
    usd: 100,
    description: "Накрыть машину целлофаном",
  },
  {
    id: "motoCover",
    label: "Чехол на мотоцикл",
    usd: 150,
    description: "Чехол на весь мотоцикл",
  },
];

/** Выбранные услуги: id → количество (0 — не выбрана). */
export type ExtraSelection = Record<string, number>;

export function extrasTotalUsd(selection: ExtraSelection): number {
  return EXTRA_SERVICES.reduce((sum, s) => sum + s.usd * Math.max(0, selection[s.id] || 0), 0);
}

export type InsuranceQuote = { usd: number; tier: string };

/**
 * Страхование: база — стоимость авто с аукционным сбором.
 * до $4000 → $150, $4001–8000 → $300, свыше $8000 → 3%. Возмещение от $100 до $1500.
 */
export function insuranceUsd(carWithFeesUsd: number): InsuranceQuote | null {
  if (!(carWithFeesUsd > 0)) return null;
  if (carWithFeesUsd <= 4000) return { usd: 150, tier: "авто до $4000" };
  if (carWithFeesUsd <= 8000) return { usd: 300, tier: "авто $4001–8000" };
  return { usd: Math.round(carWithFeesUsd * 0.03 * 100) / 100, tier: "авто свыше $8000 — 3%" };
}

export const INSURANCE_NOTE =
  "Считается от стоимости авто с аукционным сбором. Возмещение от $100 до $1500.";
