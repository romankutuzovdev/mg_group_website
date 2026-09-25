import { GetStaticPaths, GetStaticProps } from "next";
import Link from "next/link";
import { CatalogBreadcrumbs, cityCrumbs } from "@/components/catalog/breadcrumbs";
import { RegionCard } from "@/components/catalog/cards";
import {
  CatalogSEO,
  breadcrumbJsonLd,
  faqJsonLd,
  serviceJsonLd,
} from "@/components/catalog/seo";
import { CityNavLinks, SeoCta, SeoFaq } from "@/components/seo/seo-blocks";
import { PageShell } from "@/components/layout/page-shell";
import { REGION_ORDER, REGIONS } from "@/lib/catalog";
import { CITIES, cityPath, getCity, kitCityPath, type SeoCity } from "@/lib/seo/cities";
import {
  cityHubDescription,
  cityHubH1,
  cityHubTitle,
} from "@/lib/seo/copy";
import { getDictionary } from "@/lib/dictionary";

type Props = { city: SeoCity };

export default function GorodHubPage({ city }: Props) {
  const path = cityPath(city.slug);
  const title = cityHubTitle(city);
  const description = cityHubDescription(city);
  const h1 = cityHubH1(city);
  const faq = [
    {
      q: `Купить авто ${city.inLocative}?`,
      a: `Да. Подбираем авто из США, Китая, Кореи и Англии и организуем доставку ${city.inLocative}. Офис — в Гродно.`,
    },
    {
      q: `Машинокомплект ${city.inLocative}?`,
      a: `Выкупаем донор на аукционе, разбираем и везём комплект ${city.inLocative}.`,
    },
    {
      q: "Как проходит доставка?",
      a: city.deliveryNote,
    },
  ];

  return (
    <>
      <CatalogSEO
        title={title}
        description={description}
        path={path}
        jsonLd={[
          breadcrumbJsonLd([
            { name: "Главная", path: "/" },
            { name: city.name, path },
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
        <CatalogBreadcrumbs items={cityCrumbs(city)} />
        <p className="text-sm leading-relaxed text-text-secondary">{city.deliveryNote}</p>

        <h2 className="mt-10 font-display text-xl font-semibold">Откуда привозим</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {REGION_ORDER.map((slug) => {
            const region = REGIONS[slug];
            return (
              <RegionCard
                key={slug}
                href={cityPath(city.slug, slug)}
                title={`Авто из ${region.nameGenitive} ${city.inLocative}`}
                description={region.description}
              />
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-white p-6">
          <h2 className="font-display text-xl font-semibold">Машинокомплекты</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Доноры с Copart / IAAI / Copart UK с разбором и доставкой {city.inLocative}.
          </p>
          <p className="mt-4">
            <Link href={kitCityPath(city.slug)} className="font-medium text-primary hover:underline">
              Машинокомплект {city.inLocative} →
            </Link>
          </p>
          <p className="mt-2 text-sm">
            <Link href="/avto/usa/" className="text-primary hover:underline">
              Авто из США →
            </Link>
          </p>
        </div>

        <CityNavLinks cities={CITIES} currentSlug={city.slug} hrefFor={(s) => cityPath(s)} />
        <SeoFaq items={faq} />
        <SeoCta />
      </PageShell>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: CITIES.map((c) => ({ params: { city: c.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const city = getCity(ctx.params?.city as string);
  if (!city) return { notFound: true };
  return { props: { dictionary: getDictionary(), city } };
};
