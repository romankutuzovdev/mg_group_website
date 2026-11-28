import { GetStaticPaths, GetStaticProps } from "next";
import Link from "next/link";
import { CatalogBreadcrumbs, cityMakeCrumbs } from "@/components/catalog/breadcrumbs";
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
import { getDictionary } from "@/lib/dictionary";
import { consultationMessage } from "@/lib/company";

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
          {city.deliveryNote}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href={`${cityPath(city.slug)}#vydacha`} className="text-primary hover:underline">
            Выдача и доставка {city.inLocative}
          </Link>
          <a
            href={consultationMessage(`Прошу посчитать ${make.name} из ${region.nameGenitive} с доставкой в ${city.name}. Ссылка на лот: `)}
            className="text-primary hover:underline"
          >
            Запросить расчёт {make.name} до места выдачи
          </a>
        </div>

        <h2 className="mt-10 font-display text-xl font-semibold">Выбор {make.name} для заказа</h2>
        <ul className="mt-3 space-y-2 text-sm text-text-secondary">
          <li>
            <Link href={`${catalogPath(region.slug, make.slug)}#models`} className="text-primary hover:underline">
              Выбрать модель {make.name} →
            </Link>
          </li>
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

export const getStaticPaths: GetStaticPaths = async () => {
  if (process.env.VERCEL === "1") {
    return { paths: [], fallback: "blocking" };
  }
  const { allCityRegionMakeParamsAsync } = await import("@/lib/seo/paths");
  const params = await allCityRegionMakeParamsAsync();
  return {
    paths: params.map((p) => ({
      params: { city: p.city, region: p.region, make: p.make },
    })),
    fallback: false,
  };
};

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
