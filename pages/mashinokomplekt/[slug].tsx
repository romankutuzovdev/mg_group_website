import { GetStaticPaths, GetStaticProps } from "next";
import Link from "next/link";
import { AuctionsCatalog } from "@/components/auctions/auctions-catalog";
import { CatalogBreadcrumbs } from "@/components/catalog/breadcrumbs";
import {
  CatalogSEO,
  breadcrumbJsonLd,
  faqJsonLd,
  serviceJsonLd,
} from "@/components/catalog/seo";
import { PageShell } from "@/components/layout/page-shell";
import { CityNavLinks, SeoCta, SeoFaq } from "@/components/seo/seo-blocks";
import { loadCatalogLots } from "@/lib/auctions/repository";
import type { AuctionLot } from "@/lib/auctions/types";
import { getDictionary } from "@/lib/dictionary";
import {
  CITIES,
  CITY_SLUGS,
  getCity,
  kitCityPath,
  kitOriginPath,
  type SeoCity,
} from "@/lib/seo/cities";
import {
  kitCityDescription,
  kitCityFaq,
  kitCityH1,
  kitCityTitle,
  kitOriginDescription,
  kitOriginH1,
  kitOriginTitle,
} from "@/lib/seo/copy";

type CityProps = {
  kind: "city";
  city: SeoCity;
};

type OriginProps = {
  kind: "origin";
  origin: "usa" | "uk";
  lots: AuctionLot[];
};

type Props = CityProps | OriginProps;

export default function MashinokomplektSeoPage(props: Props) {
  if (props.kind === "city") {
    const { city } = props;
    const path = kitCityPath(city.slug);
    const title = kitCityTitle(city);
    const description = kitCityDescription(city);
    const h1 = kitCityH1(city);
    const faq = kitCityFaq(city);

    return (
      <>
        <CatalogSEO
          title={title}
          description={description}
          path={path}
          jsonLd={[
            breadcrumbJsonLd([
              { name: "Главная", path: "/" },
              { name: "Машинокомплекты", path: "/mashinokomplekt/" },
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
          <CatalogBreadcrumbs
            items={[
              { href: "/mashinokomplekt/", label: "Машинокомплекты" },
              { label: city.name },
            ]}
          />
          <p className="text-sm leading-relaxed text-text-secondary">{city.deliveryNote}</p>
          <ul className="mt-6 list-disc space-y-2 pl-5 text-sm text-text-secondary">
            <li>Выкуп лота на Copart / IAAI / Copart UK</li>
            <li>Разборка по бланку, упаковка, доставка {city.inLocative}</li>
            <li>Прозрачный расчёт до выдачи</li>
          </ul>
          <div className="mt-8 flex flex-wrap gap-4 text-sm">
            <Link href={kitOriginPath("usa")} className="text-primary hover:underline">
              Комплекты из США →
            </Link>
            <Link href={kitOriginPath("uk")} className="text-primary hover:underline">
              Комплекты из Англии →
            </Link>
            <Link href="/avto/usa/" className="text-primary hover:underline">
              Авто из США →
            </Link>
          </div>
          <CityNavLinks
            cities={CITIES}
            currentSlug={city.slug}
            hrefFor={(s) => kitCityPath(s)}
          />
          <SeoFaq items={faq} />
          <SeoCta primaryLabel="Заказать машинокомплект" />
        </PageShell>
      </>
    );
  }

  const { origin, lots } = props;
  const path = kitOriginPath(origin);
  const title = kitOriginTitle(origin);
  const description = kitOriginDescription(origin);
  const h1 = kitOriginH1(origin);
  const originName = origin === "usa" ? "США" : "Англии";
  const faq = [
    {
      q: `Машинокомплект из ${originName}?`,
      a:
        origin === "usa"
          ? "Да. Выкупаем донор на Copart / IAAI, разбираем в США и везём морем через Турцию и Новороссийск в Беларусь."
          : "Да. Выкупаем лот на Copart UK, разбираем в Англии и везём сушей через Францию в Беларусь.",
    },
    {
      q: "В какие города доставляете?",
      a: "Минск, Гродно, Брест, Витебск, Гомель, Могилёв и другие города РБ.",
    },
    {
      q: "Как посчитать стоимость?",
      a: "На общей странице машинокомплектов есть калькулятор: ставка, сборы, доставка и разбор. Или напишите в Telegram — посчитаем под бланк.",
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
            { name: "Машинокомплекты", path: "/mashinokomplekt/" },
            { name: h1, path },
          ]),
          serviceJsonLd({ name: h1, description, path }),
          faqJsonLd(faq),
        ]}
      />

      <section id="lots" className="scroll-mt-24 bg-bg-base pt-[calc(3.5rem+env(safe-area-inset-top,0px))] pb-12 sm:pb-16">
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          <AuctionsCatalog lots={lots} region={origin} pricingMode="kit" />
        </div>
      </section>

      <section className="border-t border-border bg-bg-elevated py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <CityNavLinks cities={CITIES} hrefFor={(s) => kitCityPath(s)} />
          <SeoFaq items={faq} />
          <SeoCta primaryLabel="Заказать машинокомплект" />
        </div>
      </section>
    </>
  );
}

const ORIGIN_SLUGS = ["usa", "uk"] as const;

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [
    ...CITY_SLUGS.map((slug) => ({ params: { slug } })),
    ...ORIGIN_SLUGS.map((slug) => ({ params: { slug } })),
  ],
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug as string;
  if (slug === "usa" || slug === "uk") {
    const all = await loadCatalogLots();
    return {
      props: {
        dictionary: getDictionary(),
        kind: "origin",
        origin: slug,
        lots: all.filter((lot) => lot.region === slug),
      },
    };
  }
  const city = getCity(slug);
  if (!city) return { notFound: true };
  return {
    props: { dictionary: getDictionary(), kind: "city", city },
  };
};
