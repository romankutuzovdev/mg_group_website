import catalog from "./generated.json";

export type CatalogRegionSlug = "usa" | "china" | "korea" | "uk";

export type CatalogModel = {
  slug: string;
  name: string;
  image: string;
};

export type CatalogMake = {
  slug: string;
  name: string;
  logo: string | null;
  regions: CatalogRegionSlug[];
  models: CatalogModel[];
};

export type CatalogRegion = {
  slug: CatalogRegionSlug;
  name: string;
  nameGenitive: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
};

export const REGIONS = catalog.regions as Record<CatalogRegionSlug, CatalogRegion>;
export const MAKES = catalog.makes as Record<string, CatalogMake>;

export const REGION_ORDER: CatalogRegionSlug[] = ["usa", "china", "korea", "uk"];

export const SITE_ORIGIN = "https://www.multiglobalgroup.com";

export function getRegion(slug: string): CatalogRegion | undefined {
  return REGIONS[slug as CatalogRegionSlug];
}

export function getMake(slug: string): CatalogMake | undefined {
  return MAKES[slug];
}

export function getMakesForRegion(region: CatalogRegionSlug): CatalogMake[] {
  return Object.values(MAKES)
    .filter((m) => m.regions.includes(region))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export function getModel(makeSlug: string, modelSlug: string): CatalogModel | undefined {
  return getMake(makeSlug)?.models.find((m) => m.slug === modelSlug);
}

export function makeInRegion(makeSlug: string, region: CatalogRegionSlug): boolean {
  return Boolean(getMake(makeSlug)?.regions.includes(region));
}

export function modelPageTitle(region: CatalogRegion, make: CatalogMake, model: CatalogModel) {
  return `${make.name} ${model.name} из ${region.nameGenitive} под ключ | MG.GROUP`;
}

export function modelPageDescription(region: CatalogRegion, make: CatalogMake, model: CatalogModel) {
  return `Купить ${make.name} ${model.name} из ${region.nameGenitive} с доставкой в Беларусь. Подбор, расчёт под ключ, таможенное оформление — MG.GROUP.`;
}

export function makePageTitle(region: CatalogRegion, make: CatalogMake) {
  return `${make.name} из ${region.nameGenitive} — купить авто под заказ | MG.GROUP`;
}

export function makePageDescription(region: CatalogRegion, make: CatalogMake) {
  return `Автомобили ${make.name} из ${region.nameGenitive} под заказ. Модели, фото, расчёт доставки и растаможки — MG.GROUP.`;
}

export function catalogPath(...parts: string[]) {
  const rest = parts.filter(Boolean).join("/");
  return rest ? `/avto/${rest}/` : "/avto/";
}

export function absoluteUrl(pathname: string) {
  return `${SITE_ORIGIN}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

/** All static paths for sitemap / getStaticPaths */
export function allCatalogPaths() {
  const paths: { region: CatalogRegionSlug; make?: string; model?: string }[] = [];
  for (const region of REGION_ORDER) {
    paths.push({ region });
    for (const make of getMakesForRegion(region)) {
      paths.push({ region, make: make.slug });
      for (const model of make.models) {
        paths.push({ region, make: make.slug, model: model.slug });
      }
    }
  }
  return paths;
}
