import Link from "next/link";
import { catalogPath, type CatalogMake, type CatalogRegion } from "@/lib/catalog";
import { cityPath, type SeoCity } from "@/lib/seo/cities";

type Crumb = { href?: string; label: string };

export function CatalogBreadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="mb-6 text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="hover:text-foreground transition-colors">
            Главная
          </Link>
        </li>
        {items.map((item) => (
          <li key={`${item.label}-${item.href ?? "current"}`} className="flex items-center gap-1.5">
            <span aria-hidden>/</span>
            {item.href ? (
              <Link href={item.href} className="hover:text-foreground transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function regionCrumbs(region: CatalogRegion): Crumb[] {
  return [
    { href: catalogPath(), label: "Каталог авто" },
    { label: region.title },
  ];
}

export function makeCrumbs(region: CatalogRegion, make: CatalogMake): Crumb[] {
  return [
    { href: catalogPath(), label: "Каталог авто" },
    { href: catalogPath(region.slug), label: region.title },
    { label: make.name },
  ];
}

export function modelCrumbs(
  region: CatalogRegion,
  make: CatalogMake,
  modelName: string,
): Crumb[] {
  return [
    { href: catalogPath(), label: "Каталог авто" },
    { href: catalogPath(region.slug), label: region.title },
    { href: catalogPath(region.slug, make.slug), label: make.name },
    { label: modelName },
  ];
}

export function cityCrumbs(city: SeoCity): Crumb[] {
  return [{ label: city.name }];
}

export function cityRegionCrumbs(city: SeoCity, region: CatalogRegion): Crumb[] {
  return [
    { href: cityPath(city.slug), label: city.name },
    { label: region.title },
  ];
}

export function cityMakeCrumbs(
  city: SeoCity,
  region: CatalogRegion,
  make: CatalogMake,
): Crumb[] {
  return [
    { href: cityPath(city.slug), label: city.name },
    { href: cityPath(city.slug, region.slug), label: region.title },
    { label: make.name },
  ];
}
