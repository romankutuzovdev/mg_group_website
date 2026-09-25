#!/usr/bin/env node
/**
 * Generates public/sitemap.xml and robots.txt from:
 * - static marketing / city routes
 * - live auction inventory via API (active lots with photos only)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SITE = process.env.SITEMAP_SITE_URL || "https://www.multiglobalgroup.com";
const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.SITEMAP_API_URL ||
  "http://91.149.133.54"
).replace(/\/$/, "");

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, "lib/catalog/generated.json"), "utf8"),
);

const CITIES = ["minsk", "grodno", "brest", "vitebsk", "gomel", "mogilev"];
const REGIONS = Object.keys(catalog.regions);
const AUCTION_GRACE_MS = 3 * 60 * 60 * 1000;
const AUCTION_SLUG_LIMIT = Number(process.env.SEO_AUCTION_SITEMAP_LIMIT || 5000);
const LOTS_CACHE_PATH = path.join(ROOT, ".cache", "catalog-lots.json");

function hasRealLotPhoto(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/auctions/lots/") && !trimmed.includes("_placeholder")) return true;
  if (/bid\.cars/i.test(trimmed)) return true;
  if (/(?:c-static|cs)\.copart\.(?:com|co\.uk)/i.test(trimmed)) return true;
  if (/iaai\.com/i.test(trimmed)) return true;
  if (/encar\.com/i.test(trimmed)) return true;
  if (trimmed.startsWith("/api/lot-image")) return true;
  if (/^https?:\/\//i.test(trimmed) && !trimmed.includes("_placeholder")) return true;
  return false;
}

function isAuctionEnded(lot) {
  const raw = (lot.auctionDate || "").trim();
  if (!raw) return false;
  const ms = Date.parse(raw.length === 10 ? `${raw}T23:59:59Z` : raw);
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now() - AUCTION_GRACE_MS;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function spaceKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function lotMakeSlug(rawMake, makes) {
  const key = spaceKey(rawMake);
  if (!key) return null;
  const slug = slugify(rawMake);
  if (makes[slug]) return slug;
  for (const make of Object.values(makes)) {
    if (spaceKey(make.name) === key) return make.slug;
  }
  return makes[slug] ? slug : null;
}

function readLotsCache() {
  try {
    if (!fs.existsSync(LOTS_CACHE_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(LOTS_CACHE_PATH, "utf8"));
    if (!Array.isArray(raw?.lots) || !raw.lots.length) return null;
    return raw.lots;
  } catch {
    return null;
  }
}

async function fetchLotsFromApi() {
  const all = [];
  let page = 1;
  let pages = 1;
  const pageSize = 100;
  while (page <= pages && page <= 80) {
    const url = `${API_BASE}/api/v1/lots?page=${page}&page_size=${pageSize}&sort=date&order=asc`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`API ${res.status} ${url}`);
    const data = await res.json();
    pages = Math.max(1, Number(data.pages) || 1);
    const items = Array.isArray(data.items) ? data.items : [];
    all.push(...items);
    if (items.length === 0) break;
    page += 1;
  }
  return all;
}

async function loadLotsForSitemap() {
  const cached = readLotsCache();
  if (cached) {
    console.log(`sitemap: loaded ${cached.length} lots from .cache/catalog-lots.json`);
    return cached;
  }
  const lots = await fetchLotsFromApi();
  console.log(`sitemap: loaded ${lots.length} lots from ${API_BASE}`);
  return lots;
}

const entries = [
  { path: "/", priority: 1, changefreq: "weekly" },
  { path: "/avto/", priority: 0.95, changefreq: "weekly" },
  { path: "/mashinokomplekt/", priority: 0.9, changefreq: "daily" },
  { path: "/mashinokomplekt/usa/", priority: 0.8, changefreq: "weekly" },
  { path: "/mashinokomplekt/uk/", priority: 0.8, changefreq: "weekly" },
  { path: "/kuplennye-avto/", priority: 0.6, changefreq: "monthly" },
  { path: "/kuplennye-mashinokomplekty/", priority: 0.8, changefreq: "weekly" },
  { path: "/otzyvy/", priority: 0.7, changefreq: "weekly" },
  { path: "/calculator/", priority: 0.7, changefreq: "monthly" },
  { path: "/about/", priority: 0.5, changefreq: "monthly" },
  { path: "/faq/", priority: 0.5, changefreq: "monthly" },
  { path: "/contacts/", priority: 0.6, changefreq: "monthly" },
];

for (const region of REGIONS) {
  entries.push({ path: `/avto/${region}/`, priority: 0.85, changefreq: "weekly" });
}

for (const city of CITIES) {
  entries.push({ path: `/gorod/${city}/`, priority: 0.85, changefreq: "weekly" });
  entries.push({ path: `/mashinokomplekt/${city}/`, priority: 0.8, changefreq: "weekly" });
  for (const region of REGIONS) {
    entries.push({ path: `/gorod/${city}/${region}/`, priority: 0.8, changefreq: "weekly" });
  }
}

let lots = [];
try {
  lots = await loadLotsForSitemap();
} catch (err) {
  console.warn("sitemap: API unavailable, auction URLs skipped:", err.message || err);
}

const live = lots.filter((l) => l?.slug && hasRealLotPhoto(l.imageUrl) && !isAuctionEnded(l));
const makeKeys = new Set();
const modelKeys = new Set();
const makes = catalog.makes || {};

for (const lot of live) {
  const region = lot.region;
  if (!REGIONS.includes(region)) continue;
  const makeSlug = lotMakeSlug(lot.make, makes);
  if (!makeSlug || !makes[makeSlug]) continue;
  if (!(makes[makeSlug].regions || []).includes(region)) continue;
  makeKeys.add(`${region}::${makeSlug}`);
  const lotModel = spaceKey(lot.model);
  if (!lotModel || lotModel === "all models") continue;
  for (const model of makes[makeSlug].models || []) {
    const nameCompact = spaceKey(model.name).replace(/\s+/g, "");
    const lotCompact = lotModel.replace(/\s+/g, "");
    if (
      lotCompact === nameCompact ||
      lotCompact === spaceKey(model.slug).replace(/\s+/g, "") ||
      lotCompact.startsWith(nameCompact)
    ) {
      modelKeys.add(`${region}::${makeSlug}::${model.slug}`);
      break;
    }
  }
}

for (const key of makeKeys) {
  const [region, make] = key.split("::");
  entries.push({ path: `/avto/${region}/${make}/`, priority: 0.75, changefreq: "daily" });
  for (const city of CITIES) {
    entries.push({
      path: `/gorod/${city}/${region}/${make}/`,
      priority: 0.65,
      changefreq: "weekly",
    });
  }
}

for (const key of modelKeys) {
  const [region, make, model] = key.split("::");
  entries.push({
    path: `/avto/${region}/${make}/${model}/`,
    priority: 0.7,
    changefreq: "daily",
  });
}

const ranked = [...live].sort((a, b) => {
  const ta = Date.parse(a.auctionDate || "") || Number.MAX_SAFE_INTEGER;
  const tb = Date.parse(b.auctionDate || "") || Number.MAX_SAFE_INTEGER;
  return ta - tb;
});

const auctionSlugs = new Set();
let indexedLots = 0;
for (const lot of ranked) {
  if (auctionSlugs.has(lot.slug)) continue;
  auctionSlugs.add(lot.slug);
  indexedLots += 1;
  entries.push({ path: `/auctions/${lot.slug}/`, priority: 0.7, changefreq: "daily" });
  if (indexedLots >= AUCTION_SLUG_LIMIT) break;
}

const seen = new Set();
const unique = entries.filter((e) => {
  if (seen.has(e.path)) return false;
  seen.add(e.path);
  return true;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${unique
  .map(
    (e) => `  <url>
    <loc>${SITE}${e.path}</loc>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority.toFixed(1)}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

const robots = `User-agent: *
Allow: /
Disallow: /cabinet/

Sitemap: ${SITE}/sitemap.xml
`;

fs.writeFileSync(path.join(ROOT, "public/sitemap.xml"), xml);
fs.writeFileSync(path.join(ROOT, "public/robots.txt"), robots);
console.log(
  `sitemap: ${unique.length} urls (makes=${makeKeys.size}, models=${modelKeys.size}, auctions=${indexedLots})`,
);
