import {
  REGION_ORDER,
  SITE_ORIGIN,
  absoluteUrl,
  getMakesForRegion,
  type CatalogRegionSlug,
} from "@/lib/catalog";
import { CITIES, cityPath, kitCityPath, kitOriginPath } from "@/lib/seo/cities";
import { getAllSlugs } from "@/lib/auctions/repository";

export type SitemapEntry = {
  path: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: number;
};

/** Все публичные SEO-пути сайта (города + каталог + лоты аукционов). */
export function allSeoPaths(): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    { path: "/", priority: 1, changefreq: "weekly" },
    { path: "/avto/", priority: 0.95, changefreq: "weekly" },
    { path: "/mashinokomplekt/", priority: 0.9, changefreq: "daily" },
    { path: "/kuplennye-avto/", priority: 0.6, changefreq: "monthly" },
    { path: "/kuplennye-mashinokomplekty/", priority: 0.8, changefreq: "weekly" },
    { path: "/otzyvy/", priority: 0.7, changefreq: "weekly" },
    { path: "/calculator/", priority: 0.7, changefreq: "monthly" },
    { path: "/about/", priority: 0.5, changefreq: "monthly" },
    { path: "/faq/", priority: 0.5, changefreq: "monthly" },
    { path: "/contacts/", priority: 0.6, changefreq: "monthly" },
    { path: "/mashinokomplekt/usa/", priority: 0.8, changefreq: "weekly" },
    { path: "/mashinokomplekt/uk/", priority: 0.8, changefreq: "weekly" },
  ];

  for (const region of REGION_ORDER) {
    entries.push({ path: `/avto/${region}/`, priority: 0.85, changefreq: "weekly" });
    for (const make of getMakesForRegion(region)) {
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
    entries.push({ path: cityPath(city.slug), priority: 0.85, changefreq: "weekly" });
    entries.push({ path: kitCityPath(city.slug), priority: 0.8, changefreq: "weekly" });

    for (const region of REGION_ORDER) {
      entries.push({
        path: cityPath(city.slug, region),
        priority: 0.8,
        changefreq: "weekly",
      });
      for (const make of getMakesForRegion(region)) {
        entries.push({
          path: cityPath(city.slug, region, make.slug),
          priority: 0.7,
          changefreq: "weekly",
        });
      }
    }
  }

  for (const slug of getAllSlugs()) {
    entries.push({
      path: `/auctions/${slug}/`,
      priority: 0.65,
      changefreq: "daily",
    });
  }

  // dedupe by path
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.path)) return false;
    seen.add(e.path);
    return true;
  });
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

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}

export type CityRegionMakeParams = {
  city: string;
  region: CatalogRegionSlug;
  make: string;
};

export function allCityRegionMakeParams(): CityRegionMakeParams[] {
  const out: CityRegionMakeParams[] = [];
  for (const city of CITIES) {
    for (const region of REGION_ORDER) {
      for (const make of getMakesForRegion(region)) {
        out.push({ city: city.slug, region, make: make.slug });
      }
    }
  }
  return out;
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
