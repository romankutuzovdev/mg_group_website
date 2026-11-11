/**
 * Таможенный калькулятор РБ (публичный, /calculator/rastamozhka).
 *
 * Ставки сверены с калькулятором autogood.by/tools/customs-calculator (ноябрь 2026):
 * - физлицо, ДВС/PHEV: единая ставка ЕЭК №107 (до 3 лет — max(% , €/см³); старше — €/см³);
 * - юрлицо, ДВС/PHEV: пошлина ЕТТ ЕАЭС (% c минимумом €/см³) + НДС 20% от (стоимость + пошлина);
 * - электро: пошлина и НДС 0, таможенный сбор 0, только утильсбор;
 * - EREV: пошлина 15% + НДС 20% от (стоимость + пошлина);
 * - льгота 50% (Указ №140) — только физлицо, не для электро.
 * Утильсбор — постановление Совмина РБ (ред. от 23.04.2026).
 */

export type CalcAge = "under3" | "from3to5" | "over5";
export type CalcEngine = "fuel" | "electric" | "erev";
export type CalcPerson = "individual" | "company";
export type CalcFuel = "petrol" | "diesel";

export type CustomsCalcInput = {
  priceEur: number;
  age: CalcAge;
  engine: CalcEngine;
  person: CalcPerson;
  fuel: CalcFuel;
  volumeCc: number;
  benefit50: boolean;
  /** Доставка до РБ, € (необязательно) */
  deliveryEur?: number;
  rates: { EUR: number; USD: number };
};

export type CalcLine = {
  key: string;
  label: string;
  amount: number;
  currency: "EUR" | "BYN";
  hint?: string;
};

export type CustomsCalcResult = {
  ok: true;
  lines: CalcLine[];
  /** Только государственные платежи (пошлина, НДС, утильсбор, сбор), BYN */
  stateFeesByn: number;
  /** Растаможка целиком, BYN */
  clearanceByn: number;
  clearanceEur: number;
  /** Под ключ: авто + доставка + растаможка */
  totalEur: number;
  totalUsd: number;
  totalByn: number;
  summary: string;
};

export type CustomsCalcError = { ok: false; error: string; field?: "price" | "volume" };

/** Таможенный сбор за таможенные операции, BYN */
export const CUSTOMS_FEE_BYN = 120;

// ---------- Физлицо (ЕЭК №107) ----------

/** До 3 лет: [до цены €, % от стоимости, не менее €/см³] */
const IND_UNDER3: [number, number, number][] = [
  [8500, 0.54, 2.5],
  [16700, 0.48, 3.5],
  [42300, 0.48, 5.5],
  [84500, 0.48, 7.5],
  [169000, 0.48, 15],
  [Infinity, 0.48, 20],
];

/** [до см³, €/см³] */
const IND_3TO5: [number, number][] = [
  [1000, 1.5],
  [1500, 1.7],
  [1800, 2.5],
  [2300, 2.7],
  [3000, 3.0],
  [Infinity, 3.6],
];

const IND_OVER5: [number, number][] = [
  [1000, 3.0],
  [1500, 3.2],
  [1800, 3.5],
  [2300, 4.8],
  [3000, 5.0],
  [Infinity, 5.7],
];

/** Утильсбор физлица (ДВС, гибриды, электро), BYN */
const IND_UTIL = { under3: 624.92, over3: 1282.02 };

// ---------- Юрлицо (ЕТТ ЕАЭС) ----------

/** Бензин 3–5 лет: 20%, не менее €/см³ */
const CO_PETROL_3TO5_MIN: [number, number][] = [
  [1000, 0.36],
  [1500, 0.4],
  [1800, 0.36],
  [2300, 0.4],
  [3000, 0.44],
  [Infinity, 0.8],
];

/** Бензин старше 5 лет: 20%, не менее €/см³ */
const CO_PETROL_OVER5_MIN: [number, number][] = [
  [1000, 0.36],
  [1500, 0.4],
  [1800, 0.36],
  [3000, 0.44],
  [Infinity, 0.8],
];

/** Дизель: % и минимум €/см³ по возрасту. Старше 5 лет — только €/см³. */
const CO_DIESEL: Record<CalcAge, { percent: number; perCc: [number, number][] }> = {
  under3: {
    percent: 0.3,
    perCc: [
      [1500, 1.45],
      [2500, 1.9],
      [Infinity, 2.8],
    ],
  },
  from3to5: {
    percent: 0.35,
    perCc: [
      [1500, 1.45],
      [2500, 2.15],
      [Infinity, 2.8],
    ],
  },
  over5: {
    percent: 0,
    perCc: [
      [1500, 2.7],
      [2500, 4.0],
      [Infinity, 5.8],
    ],
  },
};

/** Утильсбор юрлица (ДВС), BYN: [до см³, до 3 лет, старше 3 лет] */
const CO_UTIL_FUEL: [number, number, number][] = [
  [1000, 6365.57, 16249.5],
  [2000, 23575.91, 41471.55],
  [3000, 66248.51, 100301.81],
  [3500, 76068.86, 116459.46],
  [Infinity, 96868.22, 127339.56],
];

/** Утильсбор юрлица (электро), BYN */
const CO_UTIL_ELECTRIC: Record<CalcAge, number> = {
  under3: 1148.86,
  from3to5: 2757.36,
  over5: 16249.5,
};

/** Утильсбор юрлица (EREV) — как ДВС до 1000 см³ */
const CO_UTIL_EREV = { under3: 6365.57, over3: 16249.5 };

const EREV_DUTY_PERCENT = 0.15;
const VAT = 0.2;

function r2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function byVolume<T>(volume: number, table: [number, T, ...unknown[]][]): T {
  for (const row of table) if (volume <= row[0]) return row[1];
  return table[table.length - 1][1];
}

export const AGE_LABEL: Record<CalcAge, string> = {
  under3: "менее 3 лет",
  from3to5: "от 3 до 5 лет",
  over5: "более 5 лет",
};

export function calculateCustoms(
  input: CustomsCalcInput,
): CustomsCalcResult | CustomsCalcError {
  const price = Number(input.priceEur);
  const volume = Math.round(Number(input.volumeCc) || 0);
  const { age, engine, person, fuel } = input;
  const isInd = person === "individual";
  const over3 = age !== "under3";

  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "Укажите стоимость авто в евро", field: "price" };
  }
  if (engine === "fuel" && volume <= 0) {
    return { ok: false, error: "Укажите объём двигателя, см³", field: "volume" };
  }

  let dutyEur = 0;
  let vatEur = 0;
  let utilByn = 0;
  let customsFeeByn = CUSTOMS_FEE_BYN;
  let dutyHint = "";

  if (engine === "electric") {
    customsFeeByn = 0;
    utilByn = isInd ? (over3 ? IND_UTIL.over3 : IND_UTIL.under3) : CO_UTIL_ELECTRIC[age];
    dutyHint = "Электромобиль: пошлина и НДС не взимаются";
  } else if (engine === "erev") {
    dutyEur = r2(price * EREV_DUTY_PERCENT);
    vatEur = r2((price + dutyEur) * VAT);
    utilByn = isInd
      ? over3
        ? IND_UTIL.over3
        : IND_UTIL.under3
      : over3
        ? CO_UTIL_EREV.over3
        : CO_UTIL_EREV.under3;
    dutyHint = "EREV: 15% от стоимости";
  } else if (isInd) {
    if (age === "under3") {
      const [, percent, perCc] =
        IND_UNDER3.find(([max]) => price <= max) ?? IND_UNDER3[IND_UNDER3.length - 1];
      const byPrice = r2(price * percent);
      const byCc = r2(volume * perCc);
      dutyEur = Math.max(byPrice, byCc);
      dutyHint = `${Math.round(percent * 100)}%, но не менее ${perCc} €/см³`;
    } else {
      const perCc = byVolume(volume, age === "over5" ? IND_OVER5 : IND_3TO5);
      dutyEur = r2(volume * perCc);
      dutyHint = `${perCc} €/см³ × ${volume} см³`;
    }
    utilByn = over3 ? IND_UTIL.over3 : IND_UTIL.under3;
  } else {
    if (fuel === "diesel") {
      const t = CO_DIESEL[age];
      const perCc = byVolume(volume, t.perCc);
      dutyEur = Math.max(r2(price * t.percent), r2(volume * perCc));
      dutyHint = t.percent
        ? `${Math.round(t.percent * 100)}%, но не менее ${perCc} €/см³`
        : `${perCc} €/см³ × ${volume} см³`;
    } else if (age === "under3") {
      dutyEur = r2(price * 0.15);
      dutyHint = "15% от стоимости";
    } else {
      const perCc = byVolume(volume, age === "over5" ? CO_PETROL_OVER5_MIN : CO_PETROL_3TO5_MIN);
      dutyEur = Math.max(r2(price * 0.2), r2(volume * perCc));
      dutyHint = `20%, но не менее ${perCc} €/см³`;
    }
    vatEur = r2((price + dutyEur) * VAT);
    const row = CO_UTIL_FUEL.find(([max]) => volume <= max) ?? CO_UTIL_FUEL[CO_UTIL_FUEL.length - 1];
    utilByn = over3 ? row[2] : row[1];
  }

  if (input.benefit50 && isInd && engine !== "electric") {
    dutyEur = r2(dutyEur / 2);
    vatEur = r2(vatEur / 2);
    dutyHint = `${dutyHint} · льгота 50%`;
  }

  const eur = input.rates.EUR;
  const usd = input.rates.USD;
  const delivery = Math.max(0, Number(input.deliveryEur) || 0);

  const lines: CalcLine[] = [
    { key: "price", label: "Стоимость авто", amount: price, currency: "EUR" },
  ];
  if (delivery > 0) {
    lines.push({ key: "delivery", label: "Доставка", amount: delivery, currency: "EUR" });
  }
  lines.push({
    key: "duty",
    label: isInd && engine === "fuel" ? "Таможенная пошлина (единая ставка)" : "Таможенная пошлина",
    amount: dutyEur,
    currency: "EUR",
    hint: dutyHint,
  });
  if (vatEur > 0 || (!isInd && engine !== "electric")) {
    lines.push({ key: "vat", label: "НДС 20%", amount: vatEur, currency: "EUR" });
  }
  lines.push(
    { key: "util", label: "Утилизационный сбор", amount: utilByn, currency: "BYN" },
    { key: "fee", label: "Таможенный сбор", amount: customsFeeByn, currency: "BYN" },
  );

  const stateFeesByn = r2((dutyEur + vatEur) * eur + utilByn + customsFeeByn);
  const clearanceByn = stateFeesByn;
  const clearanceEur = r2(clearanceByn / eur);
  const totalEur = r2(price + delivery + clearanceEur);
  const totalByn = r2(totalEur * eur);
  const totalUsd = r2(totalByn / usd);

  const engineLabel =
    engine === "electric" ? "электромобиль" : engine === "erev" ? "гибрид EREV" : `${volume} см³`;
  const summary = `${isInd ? "Физлицо" : "Юрлицо"} · ${AGE_LABEL[age]} · ${engineLabel}`;

  return {
    ok: true,
    lines,
    stateFeesByn,
    clearanceByn,
    clearanceEur,
    totalEur,
    totalUsd,
    totalByn,
    summary,
  };
}
