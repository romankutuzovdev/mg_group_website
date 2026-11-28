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
import { KitExampleCard } from "@/components/pages/cases-feed";
import { LinkButton } from "@/components/site/button";
import { COMMERCIAL_UPDATED, KIT_DELIVERY_WINDOW, WEIGHT_FORMULA } from "@/lib/pricing/commercial";
import { PageShell } from "@/components/layout/page-shell";
import { CityNavLinks, SeoCta, SeoFaq } from "@/components/seo/seo-blocks";
import { loadLotsPageLite } from "@/lib/auctions/ssg-lite";
import type { AuctionLot } from "@/lib/auctions/types";
import { KIT_AUCTION_SOURCES } from "@/lib/auctions/types";
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
  const calculatorPath = origin === "usa" ? "/calculator/usa/" : "/calculator/angliya/";
  const introduction = origin === "usa"
    ? "MG.GROUP выкупает автомобили-доноры на Copart и IAAI, разбирает их в США и отправляет детали в Беларусь. До ставки согласуем с вами список узлов, которые нужно снять и упаковать."
    : "MG.GROUP выкупает автомобили-доноры на британских аукционах, в том числе Copart UK. На площадке под Лондоном донор разбирают по вашему списку, а детали отправляют в Беларусь.";
  const priceDetails = origin === "usa"
    ? "К ставке в долларах прибавляют сборы аукциона, перевозку до разборки, комиссию за перевод и услуги по выкупу и диспетчированию."
    : "Ставку, аукционные сборы, перевозку по Англии и комиссию за перевод считают в фунтах. На стоимость покупки может начисляться НДС. Для итога британские расходы переводят в доллары по курсу расчёта.";
  const route = origin === "usa"
    ? "Донора разбирают в Нью-Джерси или Техасе. Контейнер идёт морем через Турцию в Новороссийск, затем груз везут автотранспортом через Гродно в Минск."
    : "После разборки под Лондоном груз везут через Францию и Гродно в Минск.";
  const faq = [
    {
      q: "Что входит в машинокомплект?",
      a: "Бланк разборки определяет состав поставки. Обычно в него включают двигатель с навесным оборудованием, коробку передач, подвеску, кузовные детали и катализаторы. Сиденья можно заказать отдельно. Аккумулятор и бензобак в стандартный комплект не входят.",
    },
    {
      q: `Сколько стоит машинокомплект из ${originName}?`,
      a: `${priceDetails} Отдельная строка — тариф разбора по типу кузова или весу. Он включает доставку и таможенное оформление до Минска. При расчёте по весу действует формула ${WEIGHT_FORMULA[origin].base.toLocaleString("ru-RU")} USD + ${WEIGHT_FORMULA[origin].perKg.toLocaleString("ru-RU")} USD за килограмм.`,
    },
    {
      q: "Как доставляют комплект и сколько ждать?",
      a: `${route} Общий ориентир MG.GROUP по коммерческим условиям от ${COMMERCIAL_UPDATED} — ${KIT_DELIVERY_WINDOW}. Дату выдачи уточняют по лоту и рейсу. Довоз из Минска в другой город Беларуси рассчитывают отдельно.`,
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

      <PageShell title={h1} description={introduction}>
        <CatalogBreadcrumbs items={[
          { href: "/mashinokomplekt/", label: "Машинокомплекты" },
          { label: origin === "usa" ? "США" : "Англия" },
        ]} />
        <div className="mt-4 flex flex-wrap gap-3">
          <LinkButton href="#lots">Перейти к лотам</LinkButton>
          <LinkButton href={calculatorPath} variant="secondary">Калькулятор комплекта</LinkButton>
        </div>
        <div className="my-8 grid items-start gap-8 lg:grid-cols-2">
          <div className="space-y-5">
            {faq.map(({ q, a }) => (
              <section key={q}>
                <h2 className="font-display text-xl font-semibold">{q}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary sm:text-base">{a}</p>
              </section>
            ))}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-accent-dark underline underline-offset-2">
              <Link href="/mashinokomplekt/chto-takoe/">Состав и схемы разборки</Link>
              <Link href="/mashinokomplekt/#commercial-pricing">Коммерческий прайс MG.GROUP</Link>
            </div>
          </div>
          <section>
            <h2 className="mb-3 font-display text-xl font-semibold">Пример расчёта до Минска</h2>
            <KitExampleCard origin={origin} />
          </section>
        </div>
      </PageShell>

      <section id="lots" className="scroll-mt-24 border-t border-border bg-bg-base py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-5 font-display text-2xl font-semibold">Лоты из {originName} под разборку</h2>
          <AuctionsCatalog
            lots={lots}
            region={origin}
            pricingMode="kit"
            auctions={KIT_AUCTION_SOURCES}
          />
        </div>
      </section>

      <section className="border-t border-border bg-bg-elevated py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <CityNavLinks cities={CITIES} hrefFor={(s) => kitCityPath(s)} />
          <SeoCta primaryLabel="Заказать машинокомплект" secondaryHref="/kuplennye-mashinokomplekty/" secondaryLabel="Купленные комплекты" />
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
    const { lots } = await loadLotsPageLite({
      region: slug,
      pageSize: 12,
      auctions: KIT_AUCTION_SOURCES,
    });
    return {
      props: {
        dictionary: getDictionary(),
        kind: "origin",
        origin: slug,
        lots,
      },
      ...(process.env.VERCEL === "1" ? { revalidate: 120 } : {}),
    };
  }
  const city = getCity(slug);
  if (!city) return { notFound: true };
  return {
    props: { dictionary: getDictionary(), kind: "city", city },
  };
};
