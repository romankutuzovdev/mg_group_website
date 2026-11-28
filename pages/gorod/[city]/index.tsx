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
  kitCityDeliveryPrice,
} from "@/lib/seo/copy";
import { getDictionary } from "@/lib/dictionary";
import { COMPANY, consultationMessage } from "@/lib/company";
import { REVIEWS } from "@/lib/reviews";

type Props = { city: SeoCity };

export default function GorodHubPage({ city }: Props) {
  const path = cityPath(city.slug);
  const title = cityHubTitle(city);
  const description = cityHubDescription(city);
  const h1 = cityHubH1(city);
  const review = REVIEWS.find((item) => item.city === city.name);
  const faq = [
    {
      q: `Купить авто ${city.inLocative}?`,
      a: `Подбираем автомобиль под бюджет и организуем выдачу ${city.inLocative} после таможенного оформления. Офис MG.GROUP находится в Гродно.`,
    },
    {
      q: `Машинокомплект ${city.inLocative}?`,
      a: `Выкупаем донора в США или Англии, согласуем детали по бланку разборки и доставляем комплект в ${city.name}.`,
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
        <section id="vydacha" className="scroll-mt-24 space-y-3">
          <h2 className="font-display text-xl font-semibold">Выдача и доставка {city.inLocative}</h2>
          <p className="text-sm leading-relaxed text-text-secondary">{city.deliveryNote}</p>
          <p className="text-sm leading-relaxed text-text-secondary">
            {city.slug === "grodno"
              ? `${COMPANY.hoursWeekdays}. Точное место и время передачи автомобиля или деталей согласуйте с менеджером.`
              : `Стоимость перевозки после таможни до места выдачи ${city.inLocative} рассчитываем по заказу. Для расчёта пришлите ссылку на лот, адрес и укажите, везём целое авто или разобранный комплект.`}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <a className="text-primary hover:underline" href={consultationMessage(`Прошу рассчитать доставку в ${city.name} после таможенного оформления. Лот и адрес выдачи: `)}>Запросить стоимость доставки</a>
            <Link href="/contacts/" className="text-primary hover:underline">Контакты офиса</Link>
          </div>
          {review && (
            <p className="text-sm">
              <Link className="text-primary hover:underline" href={`/otzyvy/#otzyv-${review.id}`}>
                Отзыв клиента · {review.city} · {review.car} · {review.date}
              </Link>
            </p>
          )}
        </section>

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
            {kitCityDeliveryPrice(city)}
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
