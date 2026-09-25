/**
 * Sync auction lots → SEO catalog (lib/catalog/generated.json).
 * Source of truth for lots is the API (not generated-lots.json).
 *
 * Run: node scripts/sync-catalog-from-lots.mjs
 * Also hooked before seo:sitemap in npm run build.
 *
 * If API is unreachable, keeps existing catalog unchanged (exit 0).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CATALOG_PATH = join(ROOT, "lib/catalog/generated.json");
const LOTS_CACHE_PATH = join(ROOT, ".cache", "catalog-lots.json");
const LOTS_API = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.SITEMAP_API_URL ||
  "http://91.149.133.54"
).replace(/\/$/, "");

const MAKE_ALIASES = {
  bmw: "bmw",
  "bmw motorrad": "bmw",
  "mercedes benz": "mercedes-benz",
  "mercedes-benz": "mercedes-benz",
  mercedes: "mercedes-benz",
  "land rover": "land-rover",
  landrover: "land-rover",
  "rolls royce": "rolls-royce",
  "aston martin": "aston-martin",
  mini: "mini",
  "alfa romeo": "alfa-romeo",
};

const SKIP_MAKES = new Set(["sterling"]);

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
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function resolveMakeSlug(raw) {
  const key = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!key || SKIP_MAKES.has(normKey(raw))) return null;
  if (MAKE_ALIASES[key]) return MAKE_ALIASES[key];
  const compact = normKey(raw);
  if (MAKE_ALIASES[compact]) return MAKE_ALIASES[compact];
  return slugify(raw) || null;
}

async function loadLots() {
  try {
    const all = [];
    let page = 1;
    let pages = 1;
    while (page <= pages && page <= 80) {
      const res = await fetch(
        `${LOTS_API}/api/v1/lots?page=${page}&page_size=100&sort=date&order=desc`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      pages = Math.max(1, Number(data.pages) || 1);
      const items = Array.isArray(data.items) ? data.items : [];
      all.push(...items);
      if (!items.length) break;
      page += 1;
    }
    console.log(`sync-catalog: ${all.length} lots from ${LOTS_API}`);
    return all;
  } catch (err) {
    console.warn("sync-catalog: API unavailable, catalog unchanged:", err.message || err);
    return null;
  }
}

async function main() {
  const lots = await loadLots();
  if (!lots) return;

  mkdirSync(dirname(LOTS_CACHE_PATH), { recursive: true });
  writeFileSync(
    LOTS_CACHE_PATH,
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      source: LOTS_API,
      lots,
    }),
  );
  console.log(`sync-catalog: wrote ${lots.length} lots → .cache/catalog-lots.json`);

  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const makes = catalog.makes;
  let makesAdded = 0;
  let regionsAdded = 0;
  let modelsAdded = 0;
  let imagesSet = 0;

  for (const lot of lots) {
    const region = lot.region;
    if (!["usa", "uk", "korea", "china"].includes(region)) continue;
    const makeSlug = resolveMakeSlug(lot.make);
    if (!makeSlug) continue;

    let make = makes[makeSlug];
    if (!make) {
      make = {
        slug: makeSlug,
        name: titleCase(lot.make),
        logo: null,
        regions: [region],
        models: [],
      };
      makes[makeSlug] = make;
      makesAdded += 1;
    } else if (!make.regions.includes(region)) {
      make.regions.push(region);
      regionsAdded += 1;
    }

    const modelName = titleCase(lot.model || "");
    const modelSlug = slugify(lot.model || "");
    if (!modelSlug || modelSlug === "all-models" || modelSlug.length < 1) continue;

    let model = make.models.find((m) => m.slug === modelSlug);
    if (!model) {
      make.models.push({
        slug: modelSlug,
        name: modelName || modelSlug,
        image: lot.imageUrl || "",
      });
      modelsAdded += 1;
      if (lot.imageUrl) imagesSet += 1;
    } else if ((!model.image || model.image.startsWith("/catalog/")) && lot.imageUrl) {
      model.image = lot.imageUrl;
      imagesSet += 1;
    }
  }

  for (const make of Object.values(makes)) {
    make.models.sort((a, b) => a.name.localeCompare(b.name, "en"));
    make.regions = [...new Set(make.regions)].sort();
  }
  const sortedMakes = {};
  for (const key of Object.keys(makes).sort()) sortedMakes[key] = makes[key];
  catalog.makes = sortedMakes;
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
  console.log(
    JSON.stringify({ makesAdded, regionsAdded, modelsAdded, imagesSet, totalMakes: Object.keys(sortedMakes).length }),
  );
}

main();
