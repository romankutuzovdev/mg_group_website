export type CommercialOrigin = "uk" | "usa";

export const COMMERCIAL_UPDATED = "24.08.2026";

export const WEIGHT_FORMULA: Record<
  CommercialOrigin,
  { base: number; perKg: number; label: string; hint: string }
> = {
  uk: {
    base: 800,
    perKg: 1.6,
    label: "Англия",
    hint: "800 USD + 1,6 USD × кг — доставка и растаможка до Минска включены",
  },
  usa: {
    base: 1300,
    perKg: 2.2,
    label: "США",
    hint: "1 300 USD + 2,2 USD × кг — доставка и растаможка до Минска включены",
  },
};

export type DismantleTariff = {
  id: string;
  label: string;
  price: number;
  note?: string;
};

export const DISMANTLE_TARIFFS: Record<CommercialOrigin, DismantleTariff[]> = {
  uk: [
    { id: "sedan", label: "Седан", price: 2200 },
    { id: "suv", label: "Внедорожник", price: 2450 },
    { id: "sprinter", label: "Спринтер", price: 2350 },
    { id: "pickup", label: "Пикап / X7 / LR", price: 2750 },
  ],
  usa: [
    { id: "sedan", label: "Легковые авто", price: 4100 },
    { id: "suv", label: "Внедорожник / кроссовер", price: 4450 },
    { id: "frame_suv", label: "Рамный внедорожник", price: 4850 },
  ],
};

export type ExtraService = {
  name: string;
  uk?: string;
  usa?: string;
};

export const EXTRA_SERVICES: ExtraService[] = [
  { name: "Проводка", uk: "150 USD", usa: "100 USD" },
  { name: "Стекло любое", uk: "30 USD без гарантий" },
  { name: "Четверть (любая)", uk: "200 USD седан / 250 USD SUV", usa: "350 USD (любая)" },
  { name: "Продольный пил (боковина)", uk: "650 USD седан / 750 USD SUV", usa: "900 USD" },
  { name: "Морда", uk: "550 USD седан / 650 USD SUV", usa: "950 USD джип / 850 USD седан" },
  { name: "Задняя часть авто", uk: "550 USD седан / 650 USD SUV", usa: "950 USD / 850 USD седан" },
  { name: "Крыша", uk: "320 USD седан / 420 USD SUV", usa: "550 USD седан / 650 USD джип" },
  { name: "Ряд сидений", uk: "250 USD", usa: "250 USD" },
  { name: "Дополнительная упаковка", uk: "На всё авто +100 USD" },
  { name: "Рама внедорожника, шасси", usa: "1 500 USD" },
  { name: "Кабина пикапа / рамный SUV", usa: "4 300 USD" },
  { name: "Кабины большие (Lincoln, Tahoe, Escalade)", usa: "5 500 USD" },
];

export const USA_INLAND_DELIVERY: { miles: string; price: number }[] = [
  { miles: "до 100", price: 200 },
  { miles: "до 200", price: 275 },
  { miles: "до 250", price: 350 },
  { miles: "до 350", price: 425 },
  { miles: "350–600", price: 475 },
  { miles: "600–1 000", price: 550 },
  { miles: "1 000–1 700", price: 675 },
  { miles: "1 700+", price: 1200 },
];

export const PRICING_FORMULA = [
  "Стоимость лота + аукционный сбор",
  "Доставка по стране происхождения",
  "Комиссия за перевод 3% от (лот + аукцион + доставка по стране)",
  "Тариф разбора с доставкой и растаможкой до Минска",
];

export const USA_DISPATCHING_USD = 200;

export const USA_VOLUME_DISCOUNTS = [
  "Первая покупка с MG.GROUP — скидка 200 USD",
  "С 3-го авто — скидка 400 USD, с каждого следующего — ещё 100 USD",
];

export const COMMERCIAL_TERMS = [
  "В тариф разбора включена доставка до Минска. Довоз по РБ — отдельно, возможен самовывоз",
  "Расходы по стране — в течение 3 рабочих дней; авто свыше 15 000 USD — на следующий день",
  "Оставшаяся часть — в течение суток после получения товара",
  "На осмотр — 2 недели; при повреждении — компенсация 50% по среднерыночной цене в РБ",
  "Доставка товара — 1,5–2 месяца с момента покупки",
];

export function roundUsd(value: number): number {
  return Math.round(value);
}

export function priceByWeight(origin: CommercialOrigin, kg: number): number {
  const f = WEIGHT_FORMULA[origin];
  return roundUsd(f.base + f.perKg * kg);
}
