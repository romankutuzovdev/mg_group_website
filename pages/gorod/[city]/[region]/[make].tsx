import { GetStaticPaths, GetStaticProps } from "next";
import Link from "next/link";
import { CatalogBreadcrumbs, cityMakeCrumbs } from "@/components/catalog/breadcrumbs";
import { ModelCard } from "@/components/catalog/cards";
import {
  CatalogSEO,
  breadcrumbJsonLd,
  faqJsonLd,
  serviceJsonLd,
} from "@/components/catalog/seo";
import { CityNavLinks, SeoCta, SeoFaq } from "@/components/seo/seo-blocks";
import { PageShell } from "@/components/layout/page-shell";
import {
  catalogPath,
  getMake,
  getRegion,
  makeInRegion,
  type CatalogMake,
  type CatalogRegion,
} from "@/lib/catalog";
import { CITIES, cityPath, getCity, kitCityPath, type SeoCity } from "@/lib/seo/cities";
import {
  cityMakeDescription,
  cityMakeFaq,
  cityMakeH1,
  cityMakeTitle,
} from "@/lib/seo/copy";
import { allCityRegionMakeParams } from "@/lib/seo/paths";
import { getDictionary } from "@/lib/dictionary";

type Props = {
  city: SeoCity;
  region: CatalogRegion;
  make: CatalogMake;
};

export default function GorodMakePage({ city, region, make }: Props) {
  const path = cityPath(city.slug, region.slug, make.slug);
  const title = cityMakeTitle(city, region, make);
  const description = cityMakeDescription(city, region, make);
  const h1 = cityMakeH1(city, region, make);
  const faq = cityMakeFaq(city, region, make);

  return (
    <>
      <CatalogSEO
        title={title}
        description={description}
        path={path}
        jsonLd={[
          breadcrumbJsonLd([
            { name: "Главная", path: "/" },
            { name: city.name, path: cityPath(city.slug) },
            { name: region.title, path: cityPath(city.slug, region.slug) },
            { name: make.name, path },
          ]),
          serviceJsonLd({
            name: h1,
            description,
            path,
            areaServed: city.name,
          }),
          faqJsonLd(faq),
        ]}
      />
      <PageShell title={h1} description={description}>
        <CatalogBreadcrumbs items={cityMakeCrumbs(city, region, make)} />
        <p className="text-sm leading-relaxed text-text-secondary">
          Ищете {make.name} из {region.nameGenitive} {city.inLocative}? MG.GROUP подберёт лот,
          посчитает под ключ и организует доставку. {city.deliveryNote}
        </p>

        <h2 className="mt-10 font-display text-xl font-semibold">Модели {make.name}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {make.models.map((model) => (
            <ModelCard
              key={model.slug}
              regionSlug={region.slug}
              makeSlug={make.slug}
              makeName={make.name}
              model={model}
            />
          ))}
        </div>

        <ul className="mt-8 space-y-2 text-sm text-text-secondary">
          <li>
            <Link
              href={catalogPath(region.slug, make.slug)}
              className="text-primary hover:underline"
            >
              Каталог {make.name} из {region.nameGenitive} →
            </Link>
          </li>
          <li>
            <Link href={kitCityPath(city.slug)} className="text-primary hover:underline">
              Машинокомплект {city.inLocative} →
            </Link>
          </li>
        </ul>

        <CityNavLinks
          cities={CITIES}
          currentSlug={city.slug}
          hrefFor={(s) => cityPath(s, region.slug, make.slug)}
        />
        <SeoFaq items={faq} />
        <SeoCta />
      </PageShell>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: allCityRegionMakeParams().map((p) => ({
    params: { city: p.city, region: p.region, make: p.make },
  })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const city = getCity(ctx.params?.city as string);
  const region = getRegion(ctx.params?.region as string);
  const makeSlug = ctx.params?.make as string;
  const make = getMake(makeSlug);
  if (!city || !region || !make || !makeInRegion(makeSlug, region.slug)) {
    return { notFound: true };
  }
  return {
    props: {
      dictionary: getDictionary(),
      city,
      region,
      make,
    },
  };
};
