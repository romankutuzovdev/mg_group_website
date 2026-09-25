import { GetStaticPaths, GetStaticProps } from "next";
import Link from "next/link";
import { CatalogBreadcrumbs, cityRegionCrumbs } from "@/components/catalog/breadcrumbs";
import { MakeCard } from "@/components/catalog/cards";
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
  getMakesForRegion,
  getRegion,
  type CatalogMake,
  type CatalogRegion,
  type CatalogRegionSlug,
} from "@/lib/catalog";
import { CITIES, cityPath, getCity, type SeoCity } from "@/lib/seo/cities";
import {
  cityRegionDescription,
  cityRegionFaq,
  cityRegionH1,
  cityRegionTitle,
} from "@/lib/seo/copy";
import { allCityRegionParams } from "@/lib/seo/paths";
import { getDictionary } from "@/lib/dictionary";

type Props = {
  city: SeoCity;
  region: CatalogRegion;
  makes: CatalogMake[];
};

export default function GorodRegionPage({ city, region, makes }: Props) {
  const path = cityPath(city.slug, region.slug);
  const title = cityRegionTitle(city, region);
  const description = cityRegionDescription(city, region);
  const h1 = cityRegionH1(city, region);
  const faq = cityRegionFaq(city, region);

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
            { name: region.title, path },
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
        <CatalogBreadcrumbs items={cityRegionCrumbs(city, region)} />
        <p className="text-sm leading-relaxed text-text-secondary">{city.deliveryNote}</p>

        <h2 className="mt-10 font-display text-xl font-semibold">Марки из {region.nameGenitive}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {makes.map((make) => (
            <MakeCard
              key={make.slug}
              regionSlug={region.slug}
              make={make}
              href={cityPath(city.slug, region.slug, make.slug)}
            />
          ))}
        </div>

        <p className="mt-8 text-sm">
          <Link href={catalogPath(region.slug)} className="text-primary hover:underline">
            Каталог без привязки к городу: {region.title} →
          </Link>
        </p>

        <CityNavLinks
          cities={CITIES}
          currentSlug={city.slug}
          hrefFor={(s) => cityPath(s, region.slug)}
        />
        <SeoFaq items={faq} />
        <SeoCta />
      </PageShell>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: allCityRegionParams().map((p) => ({
    params: { city: p.city, region: p.region },
  })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const city = getCity(ctx.params?.city as string);
  const region = getRegion(ctx.params?.region as string);
  if (!city || !region) return { notFound: true };
  return {
    props: {
      dictionary: getDictionary(),
      city,
      region,
      makes: getMakesForRegion(region.slug as CatalogRegionSlug),
    },
  };
};
