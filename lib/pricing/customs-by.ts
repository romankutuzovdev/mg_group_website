/**
 * Растаможка легкового авто в РБ (ЕАЭС) — порт из mg group bot/customs_by.py
 * Решение Совета ЕЭК №107 + утильсбор Совмина РБ.
 */

export const UTIL_FEE_UNDER_3_BYN = 624.92;
export const UTIL_FEE_OVER_3_BYN = 1282.02;
export const CUSTOMS_OPS_FEE_BYN = 120.0;
export const EPTS_FEE_BYN = 80.4;

const UNDER_3_BRACKETS: [number, number, number][] = [
  [8500, 0.54, 2.5],
  [16700, 0.48, 3.5],
  [42300, 0.48, 5.5],
  [84500, 0.48, 7.5],
  [169000, 0.48, 15.0],
  [Infinity, 0.48, 20.0],
];

const AGE_3_5_CC: [number, number][] = [
  [1000, 1.5],
  [1500, 1.7],
  [1800, 2.5],
  [2300, 2.7],
  [3000, 3.0],
  [Infinity, 3.6],
];

const AGE_OVER_5_CC: [number, number][] = [
  [1000, 3.0],
  [1500, 3.2],
  [1800, 3.5],
  [2300, 4.8],
  [3000, 5.0],
  [Infinity, 5.7],
];

export type AgeBand = "under3" | "age3to5" | "over5";
export type EngineType = "fuel" | "diesel" | "electric" | "phev" | "erev";

export type CustomsByResult = {
  ok: boolean;
  error?: string;
  engineType: EngineType | string;
  isElectric: boolean;
  person: "individual" | "company";
  ageBand: AgeBand | string;
  ageBandLabel: string;
  year?: number | null;
  engineCc?: number | null;
  customsValueEur: number;
  customsValueUsd?: number | null;
  dutyEur: number;
  dutyByn: number;
  dutyNote?: string;
  formula?: string;
  benefit50?: boolean;
  utilFeeByn: number;
  customsOpsFeeByn: number;
  eptsFeeByn: number;
  totalByn: number;
  totalEur: number;
  totalUsd?: number | null;
  rates: { EUR_BYN: number; USD_BYN: number; source: string };
  notes: string[];
};

export type BynRates = {
  EUR: number;
  USD: number;
  _usd_eur?: number;
  source?: string;
};

function round2(value: number): number {
  return Math.round((value + 1e-9) * 100) / 100;
}

export function detectEngineType(
  fuel?: string | null,
  engine?: string | null,
  title?: string | null,
): EngineType {
  const blob = [fuel, engine, title].filter(Boolean).join(" ").toLowerCase();
  if (/\berev\b|range.?extend|extended.?range/.test(blob)) return "erev";
  if (/\bphev\b|plug.?in\s*hybrid|подключаем/.test(blob)) return "phev";
  if (
    /\belectric\b|\bev\b|\bbev\b|электро|electricity|battery\s*electric|tesla|электромобил|электромотор|электродвигател/.test(
      blob,
    )
  ) {
    if (
      /hybrid|гибрид|hev\b|phev|erev/.test(blob) &&
      !/\bbev\b|battery\s*electric|pure\s*electric|полностью\s*электр/.test(blob)
    ) {
      return "phev";
    }
    return "electric";
  }
  if (/diesel|дизель|tdi|cdi|dci/.test(blob)) return "diesel";
  if (/hybrid|гибрид|\bhev\b/.test(blob)) return "phev";
  return "fuel";
}

export function parseEngineCc(engine?: string | null, title?: string | null): number | null {
  const text = [engine, title].filter(Boolean).join(" ");
  if (!text.trim()) return null;
  let m = text.match(/(\d{3,4})\s*(?:cc|см\s*³|см3|cm3|куб)/i);
  if (m) return Number(m[1]);
  m = text.match(/(\d)\s*[.,]\s*(\d)\s*[lл]\b/i);
  if (m) return Number(m[1]) * 1000 + Number(m[2]) * 100;
  m = text.match(/(\d)[.,](\d)\s*(?:litre|liter)\b/i);
  if (m) return Number(m[1]) * 1000 + Number(m[2]) * 100;
  m = text.match(/\b(\d{1,2})\s*[lл]\b/i);
  if (m) {
    const liters = Number(m[1]);
    if (liters >= 1 && liters <= 8) return liters * 1000;
  }
  m = text.match(/\b(\d{4})\b/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 600 && n <= 8000) return n;
  }
  return null;
}

export function vehicleAgeBand(year?: number | null, asOf = new Date()): AgeBand {
  if (!year || year < 1950 || year > asOf.getFullYear() + 1) return "age3to5";
  const age = asOf.getFullYear() - year;
  if (age < 3) return "under3";
  if (age <= 5) return "age3to5";
  return "over5";
}

function ccRate(volumeCc: number, table: [number, number][]): number {
  for (const [maxCc, rate] of table) {
    if (volumeCc <= maxCc) return rate;
  }
  return table[table.length - 1][1];
}

function under3Bracket(priceEur: number): [number, number] {
  for (const [maxPrice, percent, perCc] of UNDER_3_BRACKETS) {
    if (priceEur <= maxPrice) return [percent, perCc];
  }
  const last = UNDER_3_BRACKETS[UNDER_3_BRACKETS.length - 1];
  return [last[1], last[2]];
}

function usdToEur(usd: number, rates: BynRates): number {
  const cross = rates._usd_eur || 0;
  if (cross > 0) return round2(usd * cross);
  if (rates.USD > 0 && rates.EUR > 0) return round2((usd * rates.USD) / rates.EUR);
  return round2(usd * 0.92);
}

export const FALLBACK_BYN_RATES: BynRates = {
  USD: 3.2,
  EUR: 3.45,
  _usd_eur: 3.2 / 3.45,
  source: "fallback",
};

/** Курсы НБРБ (клиент). При ошибке — fallback. */
export async function fetchNbrbRates(): Promise<BynRates> {
  try {
    const res = await fetch("https://www.nbrb.by/api/exrates/rates?periodicity=0");
    if (!res.ok) throw new Error(String(res.status));
    const rows = (await res.json()) as Array<{
      Cur_Abbreviation?: string;
      Cur_Scale?: number;
      Cur_OfficialRate?: number;
    }>;
    const out: BynRates = { USD: 0, EUR: 0, source: "nbrb" };
    for (const row of rows || []) {
      const cur = String(row.Cur_Abbreviation || "").toUpperCase();
      if (cur !== "EUR" && cur !== "USD") continue;
      const scale = Number(row.Cur_Scale) || 1;
      const official = Number(row.Cur_OfficialRate) || 0;
      if (official > 0) out[cur] = official / scale;
    }
    if (out.EUR > 0 && out.USD > 0) {
      out._usd_eur = out.USD / out.EUR;
      return out;
    }
  } catch {
    /* fallback */
  }
  return { ...FALLBACK_BYN_RATES };
}

export function calculateCustomsBy(input: {
  priceUsd?: number | null;
  priceEur?: number | null;
  engineCc?: number | null;
  year?: number | null;
  ageBand?: AgeBand | string | null;
  engineType?: EngineType | string | null;
  fuel?: string | null;
  engine?: string | null;
  title?: string | null;
  person?: "individual" | "company";
  benefit50?: boolean;
  includeEpts?: boolean;
  rates?: BynRates | null;
}): CustomsByResult {
  const rates = input.rates || FALLBACK_BYN_RATES;
  let engType = String(
    input.engineType || detectEngineType(input.fuel, input.engine, input.title) || "fuel",
  ).toLowerCase();
  if (["ev", "bev", "electro", "electricity"].includes(engType)) engType = "electric";

  let band = String(input.ageBand || vehicleAgeBand(input.year)).toLowerCase();
  if (["under_3", "<3", "less3"].includes(band)) band = "under3";
  else if (["3_5", "3-5", "3to5", "from3to5"].includes(band)) band = "age3to5";
  else if ([">5", "over_5", "more5"].includes(band)) band = "over5";

  const vol =
    input.engineCc && input.engineCc > 0
      ? Math.round(input.engineCc)
      : parseEngineCc(input.engine, input.title);

  const customsValueEur =
    input.priceEur != null && input.priceEur > 0
      ? round2(input.priceEur)
      : usdToEur(Number(input.priceUsd || 0), rates);

  const isElectric = engType === "electric";
  const isIndividual = !["company", "legal", "jur", "юр"].includes(
    String(input.person || "individual").toLowerCase(),
  );

  let dutyEur = 0;
  let dutyNote = "";
  let formula = "";

  if (isElectric) {
    dutyEur = 0;
    dutyNote =
      "Электромобиль (BEV): единый таможенный платёж = 0. Гибриды не считаются EV.";
    formula = "EV → 0";
  } else if (!isIndividual) {
    const dutyBase = round2(customsValueEur * 0.15);
    const vat = round2((customsValueEur + dutyBase) * 0.2);
    dutyEur = round2(dutyBase + vat);
    dutyNote =
      "Юрлицо (упрощённо): пошлина 15% + НДС 20% от (стоимость+пошлина).";
    formula = `15%×${customsValueEur} + 20%×(${customsValueEur}+${dutyBase})`;
  } else {
    if (!vol || vol < 50) {
      return {
        ok: false,
        error: "Укажите объём двигателя (см³) для расчёта пошлины",
        engineType: engType,
        isElectric,
        person: "individual",
        ageBand: band,
        ageBandLabel: "",
        year: input.year,
        engineCc: vol,
        customsValueEur,
        customsValueUsd: input.priceUsd != null ? round2(Number(input.priceUsd)) : null,
        dutyEur: 0,
        dutyByn: 0,
        utilFeeByn: 0,
        customsOpsFeeByn: 0,
        eptsFeeByn: 0,
        totalByn: 0,
        totalEur: 0,
        totalUsd: null,
        rates: {
          EUR_BYN: round2(rates.EUR || 3.45),
          USD_BYN: round2(rates.USD || 3.2),
          source: rates.source || "fallback",
        },
        notes: [],
      };
    }
    if (band === "under3") {
      const [percent, perCc] = under3Bracket(customsValueEur);
      const byPrice = round2(customsValueEur * percent);
      const byCc = round2(vol * perCc);
      dutyEur = Math.max(byPrice, byCc);
      formula = `max(${(percent * 100).toFixed(0)}%×${customsValueEur}=${byPrice}; ${vol}×${perCc}=${byCc})`;
      dutyNote = "До 3 лет: max(% от стоимости, €/см³) — Решение ЕЭК №107";
    } else if (band === "over5") {
      const perCc = ccRate(vol, AGE_OVER_5_CC);
      dutyEur = round2(vol * perCc);
      formula = `${vol}×${perCc} €/см³`;
      dutyNote = "Старше 5 лет: только €/см³ — Решение ЕЭК №107";
    } else {
      const perCc = ccRate(vol, AGE_3_5_CC);
      dutyEur = round2(vol * perCc);
      formula = `${vol}×${perCc} €/см³`;
      dutyNote = "От 3 до 5 лет: только €/см³ — Решение ЕЭК №107";
    }
  }

  if (input.benefit50 && isIndividual && !isElectric && dutyEur > 0) {
    dutyEur = round2(dutyEur * 0.5);
    dutyNote += " · льгота 50% (Указ №140)";
  }

  const utilByn = band === "under3" ? UTIL_FEE_UNDER_3_BYN : UTIL_FEE_OVER_3_BYN;
  const opsByn = CUSTOMS_OPS_FEE_BYN;
  const eptsByn = input.includeEpts === false ? 0 : EPTS_FEE_BYN;
  const eurByn = rates.EUR || 3.45;
  const usdByn = rates.USD || 3.2;
  const dutyByn = round2(dutyEur * eurByn);
  const totalByn = round2(dutyByn + utilByn + opsByn + eptsByn);
  const totalEur = round2(dutyEur + (utilByn + opsByn + eptsByn) / eurByn);
  const totalUsd = usdByn ? round2(totalByn / usdByn) : null;

  const ageBandLabel =
    band === "under3" ? "менее 3 лет" : band === "over5" ? "более 5 лет" : "от 3 до 5 лет";

  return {
    ok: true,
    engineType: engType,
    isElectric,
    person: isIndividual ? "individual" : "company",
    ageBand: band,
    ageBandLabel,
    year: input.year,
    engineCc: vol,
    customsValueEur,
    customsValueUsd: input.priceUsd != null ? round2(Number(input.priceUsd)) : null,
    dutyEur,
    dutyByn,
    dutyNote,
    formula,
    benefit50: Boolean(input.benefit50 && isIndividual),
    utilFeeByn: utilByn,
    customsOpsFeeByn: opsByn,
    eptsFeeByn: eptsByn,
    totalByn,
    totalEur,
    totalUsd,
    rates: {
      EUR_BYN: round2(eurByn),
      USD_BYN: round2(usdByn),
      source: rates.source || "fallback",
    },
    notes: [
      "Ориентир для физлица (личное пользование). Окончательную сумму определяет таможня.",
      "Возраст считается от года выпуска.",
      ...(isElectric
        ? [
            "Для EV в калькуляторе платёж = 0 по правилу MG.GROUP (гибриды — не EV).",
          ]
        : []),
    ],
  };
}
