/**
 * Доставка США из прайса — порт из mg group bot/usa_tariffs.py
 */
import inlandTariffs from "./data/usa_inland_tariffs.json";

type YardPorts = Record<
  string,
  Partial<Record<"regular" | "oversize" | "moto" | "large", number | null>>
>;
type Yard = {
  location: string;
  city: string;
  state: string;
  ports: YardPorts;
  primary_port: string;
  primary_port_label?: string;
  matched_auction?: string;
};

type TariffData = {
  copart: Yard[];
  iaai: Yard[];
  ocean: Record<string, Record<string, Partial<Record<string, number | null>>>>;
  ports: Record<string, string>;
  size_labels: Record<string, string>;
};

const data = inlandTariffs as unknown as TariffData;

const US_STATE_ABBR: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

const STATE_NAME_TO_ABBR = Object.fromEntries(
  Object.entries(US_STATE_ABBR).map(([abbr, name]) => [name.toLowerCase(), abbr]),
);

const SIZE_ALIASES: Record<string, string> = {
  regular: "regular",
  regular_large: "regular",
  large: "regular",
  reg: "regular",
  oversize: "oversize",
  oversized: "oversize",
  moto: "moto",
  motorcycle: "moto",
  bike: "moto",
};

export type VehicleSize = "regular" | "oversize" | "moto";

export function normalizeSize(vehicleSize?: string | null): VehicleSize {
  const raw = String(vehicleSize || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (SIZE_ALIASES[raw] as VehicleSize) || "regular";
}

export function normalizeAuction(auction?: string | null): "copart" | "iaai" {
  const a = String(auction || "").trim().toLowerCase();
  if (a.includes("copart")) return "copart";
  return "iaai";
}

function normText(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseLocationQuery(location?: string | null): { city: string; state: string | null } {
  const raw = String(location || "").trim();
  if (!raw) return { city: "", state: null };
  let state: string | null = null;
  let city = raw;
  let m = raw.match(/\(([A-Za-z]{2})\)\s*$/);
  if (m) {
    state = m[1].toUpperCase();
    city = raw.slice(0, m.index).replace(/[ ,.-]+$/, "");
  } else {
    m = raw.match(/,\s*([A-Za-z]{2})\s*$/);
    if (m) {
      state = m[1].toUpperCase();
      city = raw.slice(0, m.index).trim();
    } else {
      const parts = raw.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        city = parts[0];
        const maybe = parts[1];
        if (maybe.length === 2 && US_STATE_ABBR[maybe.toUpperCase()]) state = maybe.toUpperCase();
        else if (STATE_NAME_TO_ABBR[maybe.toLowerCase()]) state = STATE_NAME_TO_ABBR[maybe.toLowerCase()];
      }
    }
  }
  city = city.replace(/\s+(?:IAAI|COPART)\s*$/i, "").trim();
  return { city, state };
}

function yardStateAbbr(yard: Yard): string | null {
  const st = String(yard.state || "").trim();
  if (!st) return null;
  if (st.length === 2 && US_STATE_ABBR[st.toUpperCase()]) return st.toUpperCase();
  return STATE_NAME_TO_ABBR[st.toLowerCase()] || null;
}

function scoreYard(yard: Yard, cityQ: string, stateQ: string | null): number {
  const cityN = normText(yard.city || "");
  const q = normText(cityQ);
  if (!q || !cityN) return -1;
  let score = 0;
  if (cityN === q) score = 100;
  else if (cityN.startsWith(`${q} `) || q.startsWith(`${cityN} `)) score = 85;
  else if (q.includes(cityN) || cityN.includes(q)) score = 70;
  else {
    const qt = new Set(q.split(" ").filter(Boolean));
    const ct = new Set(cityN.split(" ").filter(Boolean));
    if (qt.size && [...qt].every((t) => ct.has(t))) score = 75;
    else if (ct.size && [...ct].every((t) => qt.has(t))) score = 72;
    else return -1;
  }
  const yState = yardStateAbbr(yard);
  if (stateQ && yState) {
    if (yState === stateQ) score += 20;
    else score -= 40;
  }
  return score;
}

export function findYard(location?: string | null, auction?: string | null): Yard | null {
  const platform = normalizeAuction(auction);
  const raw = String(location || "").trim();
  if (!raw) return null;

  // Точное совпадение с location из прайса
  const exact = (data[platform] || []).find(
    (y) => y.location.toLowerCase() === raw.toLowerCase(),
  );
  if (exact) return { ...exact, matched_auction: platform };

  const otherPlat = platform === "iaai" ? "copart" : "iaai";
  const exactOther = (data[otherPlat] || []).find(
    (y) => y.location.toLowerCase() === raw.toLowerCase(),
  );
  if (exactOther) return { ...exactOther, matched_auction: otherPlat };

  const { city: cityQ, state: stateQ } = parseLocationQuery(raw);
  if (!cityQ) return null;

  let best: Yard | null = null;
  let bestScore = -1;
  let matchedPlatform = platform;

  for (const yard of data[platform] || []) {
    const sc = scoreYard(yard, cityQ, stateQ);
    if (sc > bestScore) {
      bestScore = sc;
      best = yard;
      matchedPlatform = platform;
    }
  }

  if (!best || bestScore < 70) {
    for (const yard of data[otherPlat] || []) {
      const sc = scoreYard(yard, cityQ, stateQ);
      if (sc > bestScore) {
        bestScore = sc;
        best = yard;
        matchedPlatform = otherPlat;
      }
    }
    if (!best || bestScore < 70) return null;
  }

  return { ...best, matched_auction: matchedPlatform };
}

export function oceanUsd(
  usPort: string | null | undefined,
  vehicleSize: string | null | undefined,
  destination = "klaipeda",
): number | null {
  const size = normalizeSize(vehicleSize);
  let dest = String(destination || "klaipeda").trim().toLowerCase();
  if (dest !== "klaipeda" && dest !== "poti") dest = "klaipeda";
  let port = String(usPort || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (["new_york", "newark", "norfolk", "ny"].includes(port)) port = "new_york_norfolk";
  const rates = ((data.ocean || {})[dest] || {})[port] || {};
  if (size === "regular") {
    const val = rates.regular ?? rates.large;
    return val == null ? null : Number(val);
  }
  const val = rates[size];
  return val == null ? null : Number(val);
}

export type UsaDeliveryLookup = {
  matchedLocation: string;
  matchedAuction: string;
  city: string;
  state: string;
  usPort: string;
  usPortLabel: string;
  vehicleSize: VehicleSize;
  vehicleSizeLabel: string;
  inlandUsd: number;
  oceanUsd: number;
  oceanDestination: string;
};

export function lookupUsaDelivery(
  location: string | null | undefined,
  vehicleSize: string | null | undefined,
  auction: string | null | undefined = "iaai",
  oceanDestination = "klaipeda",
): UsaDeliveryLookup | null {
  const yard = findYard(location, auction);
  if (!yard) return null;
  const size = normalizeSize(vehicleSize);
  const portKey = yard.primary_port;
  const portPrices = (yard.ports || {})[portKey] || {};
  const inland = portPrices[size];
  if (inland == null) return null;
  let dest = String(oceanDestination || "klaipeda").trim().toLowerCase() || "klaipeda";
  if (dest !== "klaipeda" && dest !== "poti") dest = "klaipeda";
  const ocean = oceanUsd(portKey, size, dest);
  const labels = data.size_labels || {};
  const portLabels = data.ports || {};
  return {
    matchedLocation: yard.location,
    matchedAuction: yard.matched_auction || normalizeAuction(auction),
    city: yard.city,
    state: yard.state,
    usPort: portKey,
    usPortLabel: yard.primary_port_label || portLabels[portKey] || portKey,
    vehicleSize: size,
    vehicleSizeLabel: labels[size] || size,
    inlandUsd: Number(inland),
    oceanUsd: Number(ocean || 0),
    oceanDestination: dest,
  };
}

/** Все площадки прайса (для селекта в калькуляторе). */
export function listYards(auction: "iaai" | "copart" = "iaai"): string[] {
  const yards = data[auction] || [];
  return yards
    .map((y) => y.location)
    .filter(Boolean)
    .slice()
    .sort((a, b) => a.localeCompare(b));
}

/** @deprecated use listYards */
export function listPopularYards(auction: "iaai" | "copart" = "iaai", limit = 40): string[] {
  return listYards(auction).slice(0, limit);
}
