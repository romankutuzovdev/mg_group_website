/**
 * Seed demo lots for Korea + China so SEO catalogs match USA UX.
 * Uses catalog makes/models + real Copart photos as placeholders.
 *
 * Run: node scripts/seed-demo-region-lots.mjs
 * Then: npm run catalog:sync
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LOTS_PATH = join(ROOT, "lib/auctions/generated-lots.json");
const CATALOG_PATH = join(ROOT, "lib/catalog/generated.json");

const DEMO_PER_REGION = 120;
const DEMO_PREFIX = { korea: "demo-korea-", china: "demo-china-" };

/** @param {number} n */
function mulberry32(n) {
  return () => {
    n |= 0;
    n = (n + 0x6d2b79f5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function daysFromNow(rng, minD, maxD) {
  const d = minD + Math.floor(rng() * (maxD - minD + 1));
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + d);
  date.setUTCHours(10 + Math.floor(rng() * 8), Math.floor(rng() * 60), 0, 0);
  return date.toISOString();
}

/**
 * @param {"korea"|"china"} region
 * @param {object[]} makes
 * @param {string[]} photoPool
 * @param {() => number} rng
 */
function buildDemoLots(region, makes, photoPool, rng) {
  const prefix = DEMO_PREFIX[region];
  const locations =
    region === "korea"
      ? ["서울", "인천", "부산", "대구", "대전", "광주"]
      : ["上海", "广州", "深圳", "北京", "成都", "杭州"];
  const fuels =
    region === "china"
      ? ["Electric", "Hybrid", "Gasoline", "Diesel"]
      : ["Gasoline", "Diesel", "Hybrid", "Electric"];
  const damages = ["—", "Minor Dent/Scratches", "Front End", "Rear End", "Side", "Hail"];
  const lots = [];
  let i = 0;

  // Prefer makes that already have models
  const pool = makes.filter((m) => m.models?.length);
  if (!pool.length) return lots;

  while (lots.length < DEMO_PER_REGION) {
    const make = pick(rng, pool);
    const model = pick(rng, make.models);
    const year = 2016 + Math.floor(rng() * 10);
    const lotNumber = String(70000000 + Math.floor(rng() * 29999999));
    const id = `${prefix}${lotNumber}-${i}`;
    const bidBase = region === "china" ? 8000 + rng() * 42000 : 5000 + rng() * 38000;
    const currentBid = Math.round(bidBase / 100) * 100;
    const odo = Math.round((8000 + rng() * 140000) / 100) * 100;
    const imageUrl = pick(rng, photoPool);
    const source = region === "korea" ? "encar" : "china_market";
    const titleLabel = region === "korea" ? "Encar (Korea)" : "China export (demo)";

    lots.push({
      id,
      slug: `${source}-${year}-${slugify(make.name)}-${slugify(model.name)}-${lotNumber}`,
      region,
      source,
      lotNumber,
      vin: "*****************",
      make: make.name,
      model: model.name,
      year,
      titleType: "clean",
      titleLabel,
      primaryDamage: pick(rng, damages),
      odometer: odo,
      odometerUnit: "km",
      currentBid,
      buyNowPrice: Math.round(currentBid * (1.02 + rng() * 0.08)),
      currency: "USD",
      location: pick(rng, locations),
      auctionDate: daysFromNow(rng, 2, 28),
      imageUrl,
      imageUrls: [imageUrl],
      transmission: pick(rng, ["Automatic", "Manual", "CVT"]),
      fuel: pick(rng, fuels),
      drive: pick(rng, ["FWD", "RWD", "AWD", "4WD"]),
      exteriorColor: pick(rng, ["White", "Black", "Silver", "Gray", "Blue", "Red"]),
      hasKeys: rng() > 0.15,
      runsDrives: rng() > 0.2,
      estimatedRetail: Math.round(currentBid * (1.15 + rng() * 0.35)),
      lotUrl:
        region === "korea"
          ? `https://fem.encar.com/cars/detail/${lotNumber}`
          : `https://www.che168.com/dealer/${lotNumber}.html`,
      bodyStyle: model.name,
      _demo: true,
    });
    i += 1;
  }

  return lots;
}

function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const payload = JSON.parse(readFileSync(LOTS_PATH, "utf8"));
  const existing = Array.isArray(payload.lots) ? payload.lots : [];

  const photoPool = [
    ...new Set(
      existing
        .filter((l) => l.region === "usa" && l.imageUrl && /copart/i.test(l.imageUrl))
        .map((l) => l.imageUrl),
    ),
  ];
  if (photoPool.length < 20) {
    throw new Error("Need USA Copart photos in generated-lots.json to seed demos");
  }

  // Drop previous demos + tiny sample korea set (keep real non-demo korea if any)
  const kept = existing.filter((l) => {
    if (l._demo) return false;
    if (String(l.id || "").startsWith("demo-korea-") || String(l.id || "").startsWith("demo-china-"))
      return false;
    // Replace sparse sample encar dump with richer demo inventory
    if (l.region === "korea" && l.source === "encar") return false;
    if (l.region === "china") return false;
    return true;
  });

  const makes = Object.values(catalog.makes || {});
  const koreaMakes = makes.filter((m) => (m.regions || []).includes("korea"));
  const chinaMakes = makes.filter((m) => (m.regions || []).includes("china"));

  const koreaLots = buildDemoLots("korea", koreaMakes, photoPool, mulberry32(20260920));
  const chinaLots = buildDemoLots("china", chinaMakes, photoPool, mulberry32(20260921));

  const lots = [...kept, ...koreaLots, ...chinaLots];
  const counts = {
    total: lots.length,
    usa: lots.filter((l) => l.region === "usa").length,
    uk: lots.filter((l) => l.region === "uk").length,
    korea: lots.filter((l) => l.region === "korea").length,
    china: lots.filter((l) => l.region === "china").length,
    encar: lots.filter((l) => l.source === "encar").length,
    china_market: lots.filter((l) => l.source === "china_market").length,
    withPhotos: lots.filter((l) => l.imageUrl).length,
  };

  const next = {
    generatedAt: new Date().toISOString(),
    source: "usa lots + demo korea/china seed",
    counts,
    lots,
  };

  writeFileSync(LOTS_PATH, JSON.stringify(next));
  console.log("Seeded demo region lots:", counts);
}

main();
