import { GetStaticProps } from "next";
import { AuctionsCatalog } from "@/components/auctions/auctions-catalog";
import { CatalogHero, CatalogSection } from "@/components/catalog/catalog-hero";
import { MakeCard } from "@/components/catalog/cards";
import { RegionMosaic } from "@/components/catalog/region-mosaic";
import {
  CatalogSEO,
  breadcrumbJsonLd,
  faqJsonLd,
  itemListJsonLd,
  organizationJsonLd,
  serviceJsonLd,
} from "@/components/catalog/seo";
import { SeoCta, SeoFaq } from "@/components/seo/seo-blocks";
import { PageShell } from "@/components/layout/page-shell";
import {
  REGION_ORDER,
  REGIONS,
  catalogPath,
  getMakesForRegion,
  type CatalogMake,
  type CatalogRegionSlug,
} from "@/lib/catalog";
import { catalogHubFaq } from "@/lib/seo/copy";
import { getDictionary } from "@/lib/dictionary";
import { loadCatalogLots } from "@/lib/auctions/repository";
import type { AuctionLot } from "@/lib/auctions/types";
import {
  countLotsByMake,
  countLotsByRegion,
  sortMakesByInventory,
} from "@/lib/catalog/match-lots";

type Props = {
  popularByRegion: {
    regionSlug: CatalogRegionSlug;
    makes: CatalogMake[];
    lotCounts: Record<string, number>;
  }[];
  regionLotCounts: Partial<Record<CatalogRegionSlug, number>>;
  lots: AuctionLot[];
};

const TITLE = "Каталог авто из США, Китая, Кореи и Англии | MG.GROUP";
const DESCRIPTION =
  "SEO-каталог автомобилей под заказ: США, Китай, Корея, Англия. Живые лоты со ставкой, просчёт под ключ и доставка в Беларусь — MG.GROUP.";

export default function AvtoHubPage({
  popularByRegion,
  regionLotCounts,
  lots,
}: Props) {
  const path = catalogPath();
  const faq = catalogHubFaq();
  const h1 = "Каталог авто под заказ";

  return (
    <>
      <CatalogSEO
        title={TITLE}
        description={DESCRIPTION}
        path={path}
        jsonLd={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: "Главная", path: "/" },
            { name: "Каталог авто", path },
          ]),
          serviceJsonLd({ name: h1, description: DESCRIPTION, path }),
          itemListJsonLd(
            REGION_ORDER.map((slug) => ({
              name: REGIONS[slug].title,
              path: catalogPath(slug),
            })),
          ),
          faqJsonLd(faq),
        ]}
      />

      <PageShell bare>
        <CatalogHero
          title={h1}
          description="Авто из США, Китая, Кореи и Англии: ставка на аукционе, прозрачный просчёт и доставка под ключ в Беларусь."
          crumbs={[{ label: "Каталог авто" }]}
          ctas={[
            { href: "#regions", label: "Выбрать страну", variant: "primary" },
            { href: "#lots", label: "Смотреть лоты", variant: "outline" },
            { href: "/calculator/", label: "Просчёт", variant: "outline" },
          ]}
          media={
            <div className="relative select-none" aria-hidden>
              <p className="text-right font-display text-[6.5rem] font-bold leading-none tracking-tighter text-white/[0.08] sm:text-[7.5rem]">
                AUTO
              </p>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                {REGION_ORDER.map((slug) => (
                  <span
                    key={slug}
                    className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 font-display text-xs font-semibold tracking-widest text-white/55"
                  >
                    {slug === "usa" ? "US" : slug === "china" ? "CN" : slug === "korea" ? "KR" : "UK"}
                  </span>
                ))}
              </div>
            </div>
          }
        />

        <div className="mx-auto max-w-7xl space-y-14 px-3 py-10 sm:px-4 sm:py-14 lg:px-6">
          <CatalogSection
            id="regions"
            title="Откуда привозим"
            subtitle="Четыре рынка — один каталог с расчётом под ключ."
          >
            <RegionMosaic lotCounts={regionLotCounts} />
          </CatalogSection>

          {lots.length > 0 ? (
            <CatalogSection
              id="lots"
              title="Лоты со ставкой и просчётом"
              subtitle="Текущая ставка и ориентир стоимости доставки + таможни."
            >
              <AuctionsCatalog lots={lots} />
            </CatalogSection>
          ) : null}

          {popularByRegion.map(({ regionSlug, makes, lotCounts }) => {
            const region = REGIONS[regionSlug];
            if (!makes.length) return null;
            return (
              <CatalogSection
                key={regionSlug}
                title={region.title}
                subtitle={`Популярные марки из ${region.nameGenitive}`}
                action={{ href: catalogPath(regionSlug), label: "Все марки →" }}
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {makes.map((make) => (
                    <MakeCard
                      key={make.slug}
                      regionSlug={regionSlug}
                      make={make}
                      lotCount={lotCounts[make.slug] || 0}
                    />
                  ))}
                </div>
              </CatalogSection>
            );
          })}

          <SeoFaq items={faq} />
          <SeoCta />
        </div>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const lots = await loadCatalogLots();
  const regionLotCounts = countLotsByRegion(lots);
  const popularByRegion = REGION_ORDER.map((regionSlug) => {
    const lotCounts = countLotsByMake(lots, regionSlug);
    const makes = sortMakesByInventory(getMakesForRegion(regionSlug), lotCounts).slice(0, 12);
    return { regionSlug, makes, lotCounts };
  });
  return {
    props: {
      dictionary: getDictionary(),
      popularByRegion,
      regionLotCounts,
      lots,
    },
  };
};
