export const TRANSFER_FEE_RATE = 0.03;

export function round2(value: unknown): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function isCategoryB(category: unknown, title = ""): boolean {
  const raw = String(category ?? "")
    .trim()
    .toUpperCase();
  if (["B", "CAT B", "CATEGORY B", "CATB"].includes(raw)) return true;
  return /\bCAT(?:EGORY)?\s*B\b/i.test(`${category ?? ""} ${title}`);
}

const COPART_BODY_RULES: [string, string, RegExp][] = [
  [
    "motorcycle",
    "sedan",
    /\b(motor\s*cycles?|motorbikes?|scooters?|mopeds?|quads?|atvs?)\b/i,
  ],
  ["pickup", "pickup", /\b(pick[\s-]?ups?|double\s*cabs?|crew\s*cabs?|пикап)\b/i],
  [
    "van",
    "sprinter",
    /\b(sprinters?|minibuses?|mini\s*buses?|микроавтобус|people\s*carriers?|mpvs?|panel\s*vans?|combi\s*vans?|crew\s*vans?|box\s*vans?|lutons?|campers?|motorhomes?|minivans?|vans?|buses?)\b/i,
  ],
  [
    "suv",
    "suv",
    /\b(suvs?|sport\s*utility|4\s*[xх]\s*4s?|crossovers?|jeeps?|estates?|wagons?|station\s*wagons?|внедорожник)\b/i,
  ],
  ["pickup", "pickup", /\b(trucks?|lorries?|tippers?|dropsides?|chassis\s*cabs?)\b/i],
  [
    "car",
    "sedan",
    /\b(hatchbacks?|hatches?|saloons?|sedans?|coupes?|coup[eé]s?|convertibles?|cabriolets?|roadsters?|targas?|limousines?|fastbacks?|hardtops?|soft\s*tops?|седан)\b/i,
  ],
];

export function classifyVehicle(hint: string): {
  vehicleType: string;
  dismantleType: string;
  matched: boolean;
} {
  const blob = String(hint || "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [vehicleType, dismantleType, pattern] of COPART_BODY_RULES) {
    if (pattern.test(blob)) {
      return { vehicleType, dismantleType, matched: true };
    }
  }
  return { vehicleType: "car", dismantleType: "sedan", matched: false };
}

export const DELIVERY_RATES: Record<string, Record<string, number>> = {
  DEFAULT: { sedan: 300, jeep: 350, bus: 500 },
  ROCHFORD: { sedan: 130, jeep: 160, bus: 200 },
  COLCHESTER: { sedan: 190, jeep: 230, bus: 285 },
  SANDY: { sedan: 180, jeep: 230, bus: 330 },
  SANDWICH: { sedan: 130, jeep: 160, bus: 200 },
  NEWBURY: { sedan: 220, jeep: 260, bus: 330 },
  WISBECH: { sedan: 230, jeep: 280, bus: 380 },
  CORBY: { sedan: 230, jeep: 280, bus: 380 },
  WESTBURY: { sedan: 320, jeep: 380, bus: 480 },
  BRISTOL: { sedan: 300, jeep: 350, bus: 500 },
  WOLVERHAMPTON: { sedan: 320, jeep: 350, bus: 500 },
  SANDTOFT: { sedan: 370, jeep: 420, bus: 570 },
  CHESTER: { sedan: 420, jeep: 470, bus: 600 },
  YORK: { sedan: 410, jeep: 460, bus: 600 },
  PETERLEE: { sedan: 470, jeep: 570, bus: 650 },
  WHITBURN: { sedan: 910, jeep: 1100, bus: 1365 },
  "EAST KILBRIDE": { sedan: 880, jeep: 1060, bus: 1320 },
  GLOUCESTER: { sedan: 300, jeep: 350, bus: 500 },
};

export const DELIVERY_COLUMN_LABEL: Record<string, string> = {
  sedan: "Седан",
  jeep: "Джип",
  bus: "Бус",
};

/** Площадки Copart UK из прайса доставки (без DEFAULT — в конце списка в UI). */
export function listUkDeliveryLocations(): string[] {
  return Object.keys(DELIVERY_RATES)
    .filter((key) => key !== "DEFAULT")
    .sort((a, b) => a.localeCompare(b));
}

/** Тип авто для бланка разбора / доставки. */
export const VEHICLE_TYPE_OPTIONS = [
  { value: "sedan", label: "Седан / хэтчбек / купе" },
  { value: "SUV", label: "SUV / кроссовер / джип" },
  { value: "pickup", label: "Пикап / грузовик" },
  { value: "van", label: "Фургон / микроавтобус / Sprinter" },
  { value: "motorcycle", label: "Мотоцикл / квадроцикл" },
] as const;

export function resolveRegion(raw: string | null | undefined): string {
  const name = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!name) return "DEFAULT";
  if (name in DELIVERY_RATES) return name;
  for (const key of Object.keys(DELIVERY_RATES)) {
    if (key === "DEFAULT") continue;
    if (name.includes(key) || key.includes(name)) return key;
  }
  return "DEFAULT";
}

function deliveryColumn(dismantleType: string): string {
  if (dismantleType === "sprinter") return "bus";
  if (dismantleType === "suv" || dismantleType === "pickup") return "jeep";
  return "sedan";
}

export function getDelivery(
  region: string | null | undefined,
  dismantleType: string,
  categoryB: boolean,
  columnOverride?: string | null,
) {
  const key = resolveRegion(region);
  const rates = DELIVERY_RATES[key] ?? DELIVERY_RATES.DEFAULT;
  const base = deliveryColumn(dismantleType);
  const sedanAsJeep = categoryB && base === "sedan";
  const autoColumn = sedanAsJeep ? "jeep" : base;
  const picked = String(columnOverride ?? "")
    .trim()
    .toLowerCase();
  const manual = picked in DELIVERY_COLUMN_LABEL;
  const column = manual ? picked : autoColumn;
  return {
    regionKey: key,
    baseColumn: base,
    autoColumn,
    column,
    sedanAsJeep: manual ? false : sedanAsJeep,
    manual,
    amount: Number(rates[column] ?? rates.sedan),
    label: DELIVERY_COLUMN_LABEL[column] ?? column,
  };
}

export const DISMANTLE_TARIFFS_USD: Record<string, number> = {
  sedan: 2200,
  suv: 2450,
  sprinter: 2350,
  pickup: 2650,
};

export const DISMANTLE_FROM_TYPE: Record<string, string> = {
  sedan: "car",
  suv: "suv",
  sprinter: "van",
  pickup: "pickup",
};
