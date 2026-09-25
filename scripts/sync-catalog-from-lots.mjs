/**
 * Sync auction lots → SEO catalog (lib/catalog/generated.json).
 *
 * - Adds missing USA/UK/Korea/China makes from live inventory
 * - Adds missing models under each make
 * - Ensures make.regions includes the lot region
 * - Sets model.image from lot photo when empty
 *
 * Run: node scripts/sync-catalog-from-lots.mjs
 * Also hooked after import:bidcars and before seo:sitemap.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LOTS_PATH = join(ROOT, "lib/auctions/generated-lots.json");
const CATALOG_PATH = join(ROOT, "lib/catalog/generated.json");

/** @typedef {"usa"|"china"|"korea"|"uk"} Region */

const MAKE_ALIASES = {
  bmw: "bmw",
  "bmw motorrad": "bmw",
  "mercedes benz": "mercedes-benz",
  "mercedes-benz": "mercedes-benz",
  mercedes: "mercedes-benz",
  benz: "mercedes-benz",
  "land rover": "land-rover",
  landrover: "land-rover",
  "rolls royce": "rolls-royce",
  rollsroyce: "rolls-royce",
  "aston martin": "aston-martin",
  gmc: "gmc",
  mini: "mini",
  "alfa romeo": "alfa-romeo",
};

const MAKE_DISPLAY = {
  bmw: "BMW",
  gmc: "GMC",
  mini: "MINI",
  "mercedes-benz": "Mercedes-Benz",
  "land-rover": "Land Rover",
  "rolls-royce": "Rolls-Royce",
  "aston-martin": "Aston Martin",
  ram: "Ram",
  kia: "Kia",
  mg: "MG",
  iveco: "IVECO",
};

/** Skip misparsed / noise makes */
const SKIP_MAKES = new Set(["sterling"]);

/**
 * Model aliases: normalized key → display name
 * Keys are lowercase alphanumeric-collapsed strings.
 */
const MODEL_ALIASES = {
  // Jeep
  grandcher: "Grand Cherokee",
  grandcherokee: "Grand Cherokee",
  wrangler: "Wrangler",
  cherokee: "Cherokee",
  compass: "Compass",
  liberty: "Liberty",
  // Subaru
  forester: "Forester",
  outback: "Outback",
  legacy: "Legacy",
  crosstrek: "Crosstrek",
  impreza: "Impreza",
  // Toyota
  camry: "Camry",
  rav4: "RAV4",
  corolla: "Corolla",
  highlander: "Highlander",
  tundra: "Tundra",
  "4runner": "4Runner",
  prius: "Prius",
  tacoma: "Tacoma",
  avalon: "Avalon",
  chr: "C-HR",
  "c-hr": "C-HR",
  yaris: "Yaris",
  sienna: "Sienna",
  landcruis: "Land Cruiser",
  landcruiser: "Land Cruiser",
  gr86: "GR 86",
  // Land Rover
  rangerover: "Range Rover",
  rangeroversport: "Range Rover Sport",
  discovery: "Discovery",
  defender: "Defender",
  evoque: "Evoque",
  // Ford / Chevy commons
  f150: "F-150",
  f250: "F-250",
  f350: "F-350",
  silverado: "Silverado",
  equinox: "Equinox",
  tahoe: "Tahoe",
  suburban: "Suburban",
  // GMC
  sierra: "Sierra",
  terrain: "Terrain",
  acadia: "Acadia",
  yukon: "Yukon",
  // Dodge
  charger: "Charger",
  challenger: "Challenger",
  durango: "Durango",
  journey: "Journey",
  caravan: "Caravan",
  // Lexus
  rx: "RX",
  gx: "GX",
  ls: "LS",
  nx: "NX",
  is: "IS",
  es: "ES",
  ux: "UX",
  lx: "LX",
  // Honda
  civic: "Civic",
  accord: "Accord",
  crv: "CR-V",
  "cr-v": "CR-V",
  hrv: "HR-V",
  "hr-v": "HR-V",
  pilot: "Pilot",
  odyssey: "Odyssey",
  // Nissan
  altima: "Altima",
  rogue: "Rogue",
  pathfinder: "Pathfinder",
  sentra: "Sentra",
  maxima: "Maxima",
  frontier: "Frontier",
  // BMW series shorthand
  "3series": "3 Series",
  "5series": "5 Series",
  "x3": "X3",
  "x5": "X5",
  "x1": "X1",
  "x7": "X7",
  // Tesla
  model3: "Model 3",
  modely: "Model Y",
  models: "Model S",
  modelx: "Model X",
  // Hummer / Rivian
  h2: "H2",
  h3: "H3",
  r1s: "R1S",
  r1t: "R1T",
  ris: "R1S",
  // Mini
  cooper: "Cooper",
  // Porsche
  boxster: "Boxster",
  macan: "Macan",
  cayman: "Cayman",
  panamera: "Panamera",
  // Jaguar
  xe: "XE",
  xf: "XF",
  fpace: "F-Pace",
  // Acura
  mdx: "MDX",
  rdx: "RDX",
  tlx: "TLX",
  tsx: "TSX",
  integra: "Integra",
  // Buick
  enclave: "Enclave",
  encore: "Encore",
  lacrosse: "LaCrosse",
  verano: "Verano",
  // Chrysler
  pacifica: "Pacifica",
  "300": "300",
  "200": "200",
  // Lincoln
  corsair: "Corsair",
  mkx: "MKX",
  mkc: "MKC",
  mkz: "MKZ",
  navigator: "Navigator",
  // Mitsubishi
  outlander: "Outlander",
  galant: "Galant",
  lancer: "Lancer",
  // Aston
  dbx707: "DBX 707",
  dbx: "DBX",
};

const TRIM_TOKENS = new Set([
  "base",
  "prem",
  "premium",
  "limited",
  "sport",
  "se",
  "le",
  "xle",
  "ex",
  "lx",
  "trd",
  "v6",
  "v8",
  "awd",
  "4wd",
  "fwd",
  "rwd",
  "hybrid",
  "turbo",
  "gra",
  "hako",
  "hakone",
  "prime",
  "plug",
  "in",
  "tour",
  "touring",
  "suv",
  "sedan",
  "coupe",
  "cab",
  "crew",
  "super",
  "crewmax",
  "double",
  "regular",
  "lt",
  "ltz",
  "rst",
  "z71",
  "high",
  "country",
  "platinum",
  "lariat",
  "xlt",
  "xl",
  "st",
  "gt",
  "s",
  "r",
  "rs",
]);

function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function titleCase(s) {
  return String(s || "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => {
      if (/^[0-9]/.test(w)) return w.toUpperCase();
      if (w.length <= 3 && /^[a-z]+$/i.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function resolveMakeSlug(rawMake) {
  const key = String(rawMake || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!key || SKIP_MAKES.has(key.replace(/\s+/g, ""))) return null;
  if (MAKE_ALIASES[key]) return MAKE_ALIASES[key];
  const compact = key.replace(/\s+/g, "");
  if (MAKE_ALIASES[compact]) return MAKE_ALIASES[compact];
  return slugify(rawMake);
}

function resolveMakeName(slug, rawMake) {
  return MAKE_DISPLAY[slug] || titleCase(rawMake);
}

function resolveModel(rawModel) {
  const raw = String(rawModel || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "all models" || lower === "other" || lower === "unknown") return null;

  const key = normKey(raw);
  if (MODEL_ALIASES[key]) {
    const name = MODEL_ALIASES[key];
    return { slug: slugify(name), name };
  }

  // Strip common trim suffixes then re-check
  const tokens = lower.split(/[\s/_-]+/).filter(Boolean);
  while (tokens.length > 1 && TRIM_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  const stripped = tokens.join(" ");
  const strippedKey = normKey(stripped);
  if (MODEL_ALIASES[strippedKey]) {
    const name = MODEL_ALIASES[strippedKey];
    return { slug: slugify(name), name };
  }

  // Prefix match against known aliases (e.g. "tundra trd" → Tundra)
  const aliasKeys = Object.keys(MODEL_ALIASES).sort((a, b) => b.length - a.length);
  for (const ak of aliasKeys) {
    if (strippedKey.startsWith(ak) || key.startsWith(ak)) {
      const name = MODEL_ALIASES[ak];
      return { slug: slugify(name), name };
    }
  }

  const name = titleCase(stripped || raw);
  const slug = slugify(name);
  if (!slug || slug.length < 1) return null;
  return { slug, name };
}

function loadLots() {
  if (!existsSync(LOTS_PATH)) return [];
  const data = JSON.parse(readFileSync(LOTS_PATH, "utf8"));
  return Array.isArray(data.lots) ? data.lots : Array.isArray(data) ? data : [];
}

function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const lots = loadLots();
  /** @type {Record<string, {slug:string,name:string,logo:string|null,regions:string[],models:any[]}>} */
  const makes = catalog.makes;

  let makesAdded = 0;
  let regionsAdded = 0;
  let modelsAdded = 0;
  let imagesSet = 0;
  let lotsMatched = 0;
  let lotsSkipped = 0;

  for (const lot of lots) {
    const region = lot.region;
    if (region !== "usa" && region !== "uk" && region !== "korea" && region !== "china") {
      lotsSkipped++;
      continue;
    }

    const makeSlug = resolveMakeSlug(lot.make);
    if (!makeSlug) {
      lotsSkipped++;
      continue;
    }

    const modelInfo = resolveModel(lot.model);
    if (!modelInfo) {
      // still ensure make exists for region even without model page
      if (!makes[makeSlug]) {
        makes[makeSlug] = {
          slug: makeSlug,
          name: resolveMakeName(makeSlug, lot.make),
          logo: `/catalog/makes/${makeSlug}.png`,
          regions: [region],
          models: [],
        };
        makesAdded++;
      } else if (!makes[makeSlug].regions.includes(region)) {
        makes[makeSlug].regions.push(region);
        regionsAdded++;
      }
      lotsMatched++;
      continue;
    }

    lotsMatched++;

    if (!makes[makeSlug]) {
      makes[makeSlug] = {
        slug: makeSlug,
        name: resolveMakeName(makeSlug, lot.make),
        logo: `/catalog/makes/${makeSlug}.png`,
        regions: [region],
        models: [],
      };
      makesAdded++;
    } else {
      if (!makes[makeSlug].regions.includes(region)) {
        makes[makeSlug].regions.push(region);
        regionsAdded++;
      }
      // Prefer proper display casing
      if (MAKE_DISPLAY[makeSlug]) makes[makeSlug].name = MAKE_DISPLAY[makeSlug];
      if (!makes[makeSlug].logo) {
        makes[makeSlug].logo = `/catalog/makes/${makeSlug}.png`;
      }
    }

    const make = makes[makeSlug];
    let model = make.models.find((m) => m.slug === modelInfo.slug);
    if (!model) {
      // also match by normalized name
      model = make.models.find((m) => normKey(m.name) === normKey(modelInfo.name));
    }
    if (!model) {
      make.models.push({
        slug: modelInfo.slug,
        name: modelInfo.name,
        image: lot.imageUrl || "",
      });
      modelsAdded++;
      if (lot.imageUrl) imagesSet++;
    } else {
      if ((!model.image || model.image.startsWith("/catalog/models/")) && lot.imageUrl) {
        // Prefer live auction photo over missing local path
        if (!model.image || model.image.startsWith("/catalog/")) {
          model.image = lot.imageUrl;
          imagesSet++;
        }
      }
      // keep nicer display name from aliases
      if (MODEL_ALIASES[normKey(model.name)] || MODEL_ALIASES[normKey(modelInfo.name)]) {
        model.name = modelInfo.name;
      }
    }
  }

  // Sort models within each make
  for (const make of Object.values(makes)) {
    make.models.sort((a, b) => a.name.localeCompare(b.name, "en"));
    make.regions = [...new Set(make.regions)].sort();
  }

  // Stable key order: sort make keys alphabetically in output object
  const sortedMakes = {};
  for (const key of Object.keys(makes).sort()) {
    sortedMakes[key] = makes[key];
  }
  catalog.makes = sortedMakes;

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");

  const usaMakes = Object.values(sortedMakes).filter((m) => m.regions.includes("usa")).length;
  console.log(
    JSON.stringify(
      {
        lotsTotal: lots.length,
        lotsMatched,
        lotsSkipped,
        makesAdded,
        regionsAdded,
        modelsAdded,
        imagesSet,
        usaMakes,
        totalMakes: Object.keys(sortedMakes).length,
      },
      null,
      2,
    ),
  );
}

main();
