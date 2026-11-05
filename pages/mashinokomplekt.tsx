import { GetStaticProps } from "next";
import Image from "next/image";
import Link from "next/link";
import SEO from "@/components/SEO";
import { AuctionsCatalog } from "@/components/auctions/auctions-catalog";
import { YardsMap } from "@/components/kits/yards-map";
import { PageShell } from "@/components/layout/page-shell";
import { CommercialPricingSection } from "@/components/pricing/commercial-pricing-section";
import { CityNavLinks } from "@/components/seo/seo-blocks";
import { AnchorButton, LinkButton } from "@/components/site/button";
import type { AuctionLot } from "@/lib/auctions/types";
import { KIT_AUCTION_SOURCES } from "@/lib/auctions/types";
import { loadLotsPageLite } from "@/lib/auctions/ssg-lite";
import { getDictionary, type Dictionary } from "@/lib/dictionary";
import { CONSULTATION_TG, PARTS } from "@/lib/company";
import { CITIES, kitCityPath, kitOriginPath } from "@/lib/seo/cities";

interface Props {
  dictionary: Dictionary;
  lots: AuctionLot[];
}

const KIT_ORIGINS = [
  {
    origin: "usa",
    label: "США",
    title: "Комплекты из США",
    text: "Copart / IAAI, разбор в США, море через Турцию и Новороссийск.",
    image: "/calculator/usa.jpg",
  },
  {
    origin: "uk",
    label: "Англия",
    title: "Комплекты из Англии",
    text: "Copart UK, разбор у Лондона, сухопутная доставка через Францию.",
    image: "/calculator/angliya.jpg",
  },
] as const;

export default function MashinokomplektPage({ dictionary, lots }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Машинокомплекты с аукционов США и Англии | MG.GROUP",
            description:
              "Машинокомплекты из США и Англии: лоты Copart / IAAI / Copart UK со ставками и расчётом под ключ. Разборка, упаковка, доставка в Беларусь.",
          },
        }}
        lang="ru"
        path="/mashinokomplekt/"
      />

      <PageShell
        title="Машинокомплекты с аукционов США и Англии"
        description="Выкупаем авто-доноры на Copart, IAAI и Copart UK, разбираем по бланку и везём комплектом в Беларусь."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {KIT_ORIGINS.map((item) => (
            <Link
              key={item.origin}
              href={kitOriginPath(item.origin)}
              className="group relative isolate block overflow-hidden rounded-2xl bg-black ring-1 ring-inset ring-white/10 transition hover:ring-primary/60"
            >
              <Image
                src={item.image}
                alt={item.title}
                fill
                className="object-cover transition duration-700 group-hover:scale-[1.04]"
                sizes="(max-width: 640px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
              <div className="relative z-10 flex min-h-[260px] flex-col justify-end p-6 sm:min-h-[300px] sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#22c55e]">{item.label}</p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-white">{item.title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-white/90">{item.text}</p>
                <span className="mt-4 inline-block text-sm font-semibold text-[#22c55e]">Открыть →</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PARTS.features.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-white/10 bg-stone-950 p-6 text-white sm:p-8">
              <h2 className="font-display text-xl font-semibold">{feature.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-white/85">{feature.description}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href={kitOriginPath("usa")}>Из США</LinkButton>
          <LinkButton href={kitOriginPath("uk")} variant="secondary">
            Из Англии
          </LinkButton>
          <LinkButton href="/mashinokomplekt/chto-takoe/" variant="secondary">
            Что такое комплект
          </LinkButton>
          <LinkButton href="/calculator/mashinokomplekt/" variant="secondary">
            Калькулятор комплекта
          </LinkButton>
          <LinkButton href="#lots" variant="secondary">
            Лоты
          </LinkButton>
          <LinkButton href="/kuplennye-mashinokomplekty/" variant="secondary">
            Купленные комплекты
          </LinkButton>
          <AnchorButton
            href={CONSULTATION_TG}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
          >
            Заказать подбор
          </AnchorButton>
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-white p-6">
          <h2 className="font-display text-xl font-semibold">По городам</h2>
          <p className="mt-2 text-sm text-text-secondary">
            SEO-страницы под запросы вроде «машинокомплект в Гродно».
          </p>
          <CityNavLinks cities={CITIES} hrefFor={(s) => kitCityPath(s)} />
        </div>
      </PageShell>

      <section id="lots" className="scroll-mt-24 border-t border-border bg-bg-base py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="lux-kicker">Аукционы для комплектов</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Лоты Copart / Bid.cars — США · Copart UK — Англия
            </h2>
            <p className="mt-4 text-sm text-text-secondary sm:text-base">
              Это не «готовые авто под ключ», а доноры под машинокомплект: смотрите ставку, повреждения и
              сразу считайте стоимость с доставкой и разбором.
            </p>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
          <AuctionsCatalog lots={lots} pricingMode="kit" auctions={KIT_AUCTION_SOURCES} />
        </div>
      </section>

      <YardsMap />

      <CommercialPricingSection />

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card-premium rounded-2xl p-8">
            <h2 className="font-display text-xl font-semibold">Как это работает</h2>
            <ul className="mt-4 space-y-2 text-sm text-text-secondary">
              <li>Подбираем лот на аукционе США или Англии под ваш бланк</li>
              <li>США: аукцион → Нью-Джерси / Техас → море → Турция → Новороссийск → Гродно / Минск</li>
              <li>Англия: Лондон → Франция → Гродно → Минск по суше</li>
              <li>Разборка, упаковка и контейнер — под ваш объём (штучно или оптом)</li>
            </ul>
          </div>
          <div className="card-premium rounded-2xl p-8">
            <h2 className="font-display text-xl font-semibold">{PARTS.ctaTitle}</h2>
            <p className="mt-3 text-sm text-text-secondary">{PARTS.ctaDescription}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <AnchorButton href={CONSULTATION_TG} target="_blank" rel="noopener noreferrer">
                Заказать машинокомплект
              </AnchorButton>
              <LinkButton href="/kuplennye-mashinokomplekty/" variant="secondary">
                Купленные комплекты
              </LinkButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  const { lots } = await loadLotsPageLite({
    pageSize: 12,
    auctions: KIT_AUCTION_SOURCES,
  });
  return {
    props: {
      dictionary: getDictionary(),
      lots,
    },
    ...(process.env.VERCEL === "1" ? { revalidate: 120 } : {}),
  };
};
