#!/usr/bin/env node
/**
 * Generates public/sitemap.xml and refreshes public/robots.txt
 * from catalog JSON, live auction lots, and fixed city/SEO routes.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SITE = "https://www.multiglobalgroup.com";
const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, "lib/catalog/generated.json"), "utf8"),
);
const lotsPayload = JSON.parse(
  fs.readFileSync(path.join(ROOT, "lib/auctions/generated-lots.json"), "utf8"),
);

const CITIES = ["minsk", "grodno", "brest", "vitebsk", "gomel", "mogilev"];
const REGIONS = Object.keys(catalog.regions);
const AUCTION_GRACE_MS = 3 * 60 * 60 * 1000;

/** Match lib/auctions/lot-image-url.isRealLotPhotoUrl (sitemap-side). */
function hasRealLotPhoto(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/auctions/lots/") && !trimmed.includes("_placeholder")) return true;
  if (/bid\.cars/i.test(trimmed)) return true;
  if (/(?:c-static|cs)\.copart\.(?:com|co\.uk)/i.test(trimmed)) return true;
  if (trimmed.startsWith("/api/lot-image")) return true;
  return false;
}

function isAuctionEnded(lot) {
  const raw = (lot.auctionDate || "").trim();
  if (!raw) return false;
  const ms = Date.parse(raw.length === 10 ? `${raw}T23:59:59Z` : raw);
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now() - AUCTION_GRACE_MS;
}

/** @type {{ path: string, priority: number, changefreq: string }[]} */
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
  for (const make of Object.values(catalog.makes)) {
    if (!make.regions.includes(region)) continue;
    entries.push({
      path: `/avto/${region}/${make.slug}/`,
      priority: 0.75,
      changefreq: "weekly",
    });
    for (const model of make.models) {
      entries.push({
        path: `/avto/${region}/${make.slug}/${model.slug}/`,
        priority: 0.7,
        changefreq: "weekly",
      });
    }
  }
}

for (const city of CITIES) {
  entries.push({ path: `/gorod/${city}/`, priority: 0.85, changefreq: "weekly" });
  entries.push({
    path: `/mashinokomplekt/${city}/`,
    priority: 0.8,
    changefreq: "weekly",
  });
  for (const region of REGIONS) {
    entries.push({
      path: `/gorod/${city}/${region}/`,
      priority: 0.8,
      changefreq: "weekly",
    });
    for (const make of Object.values(catalog.makes)) {
      if (!make.regions.includes(region)) continue;
      entries.push({
        path: `/gorod/${city}/${region}/${make.slug}/`,
        priority: 0.7,
        changefreq: "weekly",
      });
    }
  }
}

const auctionSlugs = new Set();
for (const lot of lotsPayload.lots || []) {
  if (!lot?.slug || auctionSlugs.has(lot.slug)) continue;
  if (!hasRealLotPhoto(lot.imageUrl)) continue;
  if (isAuctionEnded(lot)) continue;
  auctionSlugs.add(lot.slug);
  entries.push({
    path: `/auctions/${lot.slug}/`,
    priority: 0.65,
    changefreq: "daily",
  });
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

Sitemap: ${SITE}/sitemap.xml
`;

fs.writeFileSync(path.join(ROOT, "public/sitemap.xml"), xml);
fs.writeFileSync(path.join(ROOT, "public/robots.txt"), robots);
console.log(`sitemap: ${unique.length} urls`);
