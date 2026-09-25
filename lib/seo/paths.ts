import {
  REGION_ORDER,
  SITE_ORIGIN,
  absoluteUrl,
  type CatalogRegionSlug,
} from "@/lib/catalog";
import { CITIES, cityPath, kitCityPath, kitOriginPath } from "@/lib/seo/cities";
import { buildSeoInventory } from "@/lib/auctions/seo-inventory";

export type SitemapEntry = {
  path: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: number;
};

/**
 * SEO paths for sitemap / robots.
 * Catalog make/model and auction URLs come from live inventory only
 * (active lots with photos) — no empty thin pages.
 */
export async function allSeoPathsAsync(): Promise<SitemapEntry[]> {
  const inv = await buildSeoInventory();
  const makeKey = new Set(inv.makePaths.map((p) => `${p.region}::${p.make}`));

  const entries: SitemapEntry[] = [
    { path: "/", priority: 1, changefreq: "weekly" },
    { path: "/avto/", priority: 0.95, changefreq: "weekly" },
    { path: "/mashinokomplekt/", priority: 0.9, changefreq: "daily" },
    { path: "/kuplennye-avto/", priority: 0.6, changefreq: "monthly" },
    { path: "/kuplennye-mashinokomplekty/", priority: 0.8, changefreq: "weekly" },
    { path: "/otzyvy/", priority: 0.7, changefreq: "weekly" },
    { path: "/calculator/", priority: 0.7, changefreq: "monthly" },
    { path: "/cabinet/", priority: 0.3, changefreq: "monthly" },
    { path: "/about/", priority: 0.5, changefreq: "monthly" },
    { path: "/faq/", priority: 0.5, changefreq: "monthly" },
    { path: "/contacts/", priority: 0.6, changefreq: "monthly" },
    { path: "/mashinokomplekt/usa/", priority: 0.8, changefreq: "weekly" },
    { path: "/mashinokomplekt/uk/", priority: 0.8, changefreq: "weekly" },
  ];

  for (const region of REGION_ORDER) {
    entries.push({ path: `/avto/${region}/`, priority: 0.85, changefreq: "weekly" });
  }

  for (const p of inv.makePaths) {
    entries.push({
      path: `/avto/${p.region}/${p.make}/`,
      priority: 0.75,
      changefreq: "daily",
    });
  }

  for (const p of inv.modelPaths) {
    entries.push({
      path: `/avto/${p.region}/${p.make}/${p.model}/`,
      priority: 0.7,
      changefreq: "daily",
    });
  }

  for (const city of CITIES) {
    entries.push({ path: cityPath(city.slug), priority: 0.85, changefreq: "weekly" });
    entries.push({ path: kitCityPath(city.slug), priority: 0.8, changefreq: "weekly" });

    for (const region of REGION_ORDER) {
      entries.push({
        path: cityPath(city.slug, region),
        priority: 0.8,
        changefreq: "weekly",
      });
      // City × make only when that region/make has live stock
      for (const p of inv.makePaths) {
        if (p.region !== region) continue;
        if (!makeKey.has(`${region}::${p.make}`)) continue;
        entries.push({
          path: cityPath(city.slug, region, p.make),
          priority: 0.65,
          changefreq: "weekly",
        });
      }
    }
  }

  for (const slug of inv.auctionSlugs) {
    entries.push({
      path: `/auctions/${slug}/`,
      priority: 0.7,
      changefreq: "daily",
    });
  }

  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.path)) return false;
    seen.add(e.path);
    return true;
  });
}

/** Sync fallback without lots (build-time without API). Prefer allSeoPathsAsync. */
export function allSeoPaths(): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    { path: "/", priority: 1, changefreq: "weekly" },
    { path: "/avto/", priority: 0.95, changefreq: "weekly" },
    { path: "/mashinokomplekt/", priority: 0.9, changefreq: "daily" },
    { path: "/kuplennye-avto/", priority: 0.6, changefreq: "monthly" },
    { path: "/kuplennye-mashinokomplekty/", priority: 0.8, changefreq: "weekly" },
    { path: "/otzyvy/", priority: 0.7, changefreq: "weekly" },
    { path: "/calculator/", priority: 0.7, changefreq: "monthly" },
    { path: "/cabinet/", priority: 0.3, changefreq: "monthly" },
    { path: "/about/", priority: 0.5, changefreq: "monthly" },
    { path: "/faq/", priority: 0.5, changefreq: "monthly" },
    { path: "/contacts/", priority: 0.6, changefreq: "monthly" },
    { path: "/mashinokomplekt/usa/", priority: 0.8, changefreq: "weekly" },
    { path: "/mashinokomplekt/uk/", priority: 0.8, changefreq: "weekly" },
  ];
  for (const region of REGION_ORDER) {
    entries.push({ path: `/avto/${region}/`, priority: 0.85, changefreq: "weekly" });
  }
  for (const city of CITIES) {
    entries.push({ path: cityPath(city.slug), priority: 0.85, changefreq: "weekly" });
    entries.push({ path: kitCityPath(city.slug), priority: 0.8, changefreq: "weekly" });
    for (const region of REGION_ORDER) {
      entries.push({ path: cityPath(city.slug, region), priority: 0.8, changefreq: "weekly" });
    }
  }
  return entries;
}

export async function buildSitemapXmlAsync(): Promise<string> {
  return buildSitemapXml(await allSeoPathsAsync());
}

export function buildSitemapXml(entries: SitemapEntry[] = allSeoPaths()): string {
  const urls = entries
    .map((e) => {
      const loc = absoluteUrl(e.path);
      const priority = e.priority ?? 0.5;
      const changefreq = e.changefreq ?? "weekly";
      return `  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function robotsTxt(): string {
  return `User-agent: *
Allow: /
Disallow: /cabinet/

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}

export type CityRegionMakeParams = {
  city: string;
  region: CatalogRegionSlug;
  make: string;
};

/** Only city×region×make combos that have live stock in that region. */
export async function allCityRegionMakeParamsAsync(): Promise<CityRegionMakeParams[]> {
  const inv = await buildSeoInventory();
  const out: CityRegionMakeParams[] = [];
  for (const city of CITIES) {
    for (const p of inv.makePaths) {
      out.push({ city: city.slug, region: p.region, make: p.make });
    }
  }
  return out;
}

/** @deprecated Prefer allCityRegionMakeParamsAsync */
export function allCityRegionMakeParams(): CityRegionMakeParams[] {
  return [];
}

export function allCityRegionParams(): { city: string; region: CatalogRegionSlug }[] {
  const out: { city: string; region: CatalogRegionSlug }[] = [];
  for (const city of CITIES) {
    for (const region of REGION_ORDER) {
      out.push({ city: city.slug, region });
    }
  }
  return out;
}

export { kitOriginPath };
