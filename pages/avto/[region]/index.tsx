import { GetStaticPaths, GetStaticProps } from "next";
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
import { CityNavLinks, SeoCta, SeoFaq } from "@/components/seo/seo-blocks";
import { PageShell } from "@/components/layout/page-shell";
import {
  REGION_ORDER,
  catalogPath,
  getMakesForRegion,
  getRegion,
  type CatalogMake,
  type CatalogRegion,
  type CatalogRegionSlug,
} from "@/lib/catalog";
import { getRegionVisual } from "@/lib/catalog/region-visual";
import { CITIES, cityPath } from "@/lib/seo/cities";
import { catalogRegionFaq } from "@/lib/seo/copy";
import { getDictionary } from "@/lib/dictionary";
import { loadCatalogLots } from "@/lib/auctions/repository";
import type { AuctionLot } from "@/lib/auctions/types";
import type { LotPricingMode } from "@/lib/auctions/lot-quote";
import { countLotsByMake, countLotsByRegion, sortMakesByInventory } from "@/lib/catalog/match-lots";

type Props = {
  region: CatalogRegion;
  makes: CatalogMake[];
  lotCounts: Record<string, number>;
  regionLotCounts: Partial<Record<CatalogRegionSlug, number>>;
  lots: AuctionLot[];
  pricingMode: LotPricingMode;
};

function regionPricingMode(slug: CatalogRegionSlug): LotPricingMode {
  return slug === "uk" ? "kit" : "restoration";
}

function regionExtraCta(slug: CatalogRegionSlug): { href: string; label: string } | null {
  if (slug === "uk") return { href: "/mashinokomplekt/uk/", label: "Комплекты UK" };
  return null;
}

export default function AvtoRegionPage({
  region,
  makes,
  lotCounts,
  regionLotCounts,
  lots,
  pricingMode,
}: Props) {
  const path = catalogPath(region.slug);
  const visual = getRegionVisual(region.slug);
  const title = `${region.title} — купить под заказ | MG.GROUP`;
  const description = region.description;
  const h1 = region.h1;
  const faq = catalogRegionFaq(region);
  const extra = regionExtraCta(region.slug);
  const catalogRegion =
    region.slug === "usa" ||
    region.slug === "uk" ||
    region.slug === "korea" ||
    region.slug === "china"
      ? region.slug
      : undefined;

  const hasLots = lots.length > 0;
  const heroCtas = [
    { href: "#makes", label: "Марки", variant: "primary" as const },
    ...(hasLots
      ? [{ href: "#lots", label: "Актуальные лоты", variant: "outline" as const }]
      : []),
    { href: "/calculator/", label: "Просчёт", variant: "outline" as const },
    ...(extra
      ? [{ href: extra.href, label: extra.label, variant: "outline" as const }]
      : []),
  ];

  return (
    <>
      <CatalogSEO
        title={title}
        description={description}
        path={path}
        jsonLd={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: "Главная", path: "/" },
            { name: "Каталог авто", path: catalogPath() },
            { name: region.title, path },
          ]),
          serviceJsonLd({ name: h1, description, path }),
          itemListJsonLd(
            makes.map((make) => ({
              name: make.name,
              path: catalogPath(region.slug, make.slug),
            })),
          ),
          faqJsonLd(faq),
        ]}
      />

      <PageShell bare>
        <CatalogHero
          title={h1}
          description={region.intro}
          crumbs={[
            { href: catalogPath(), label: "Каталог авто" },
            { label: region.title },
          ]}
          wash={visual.wash}
          glow={visual.glow}
          ctas={heroCtas}
          media={
            <div className="select-none text-right" aria-hidden>
              <p className="font-display text-[7rem] font-bold leading-none tracking-tighter text-white/[0.1]">
                {visual.code}
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/45">
                {visual.tagline}
              </p>
            </div>
          }
        />

        <div className="mx-auto max-w-7xl space-y-12 px-3 py-8 sm:px-4 sm:py-12 lg:px-6">
          <RegionMosaic lotCounts={regionLotCounts} active={region.slug} variant="strip" />

          <CatalogSection
            id="makes"
            title={`Марки из ${region.nameGenitive}`}
            subtitle="Выберите марку — модели и расчёт под ключ. Живые лоты подтягиваются, когда есть на площадке."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {makes.map((make) => (
                <MakeCard
                  key={make.slug}
                  regionSlug={region.slug}
                  make={make}
                  lotCount={lotCounts[make.slug] || 0}
                />
              ))}
            </div>
          </CatalogSection>

          <CatalogSection
            id="lots"
            title={`Актуальные лоты из ${region.nameGenitive}`}
            subtitle="Живые лоты с API: ставка и ориентир стоимости под ключ. Обновляются автоматически."
          >
            <AuctionsCatalog
              lots={lots}
              region={catalogRegion}
              pricingMode={pricingMode}
            />
          </CatalogSection>

          <CityNavLinks cities={CITIES} hrefFor={(s) => cityPath(s, region.slug)} />
          <SeoFaq items={faq} />
          <SeoCta />
        </div>
      </PageShell>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: REGION_ORDER.map((region) => ({ params: { region } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const region = getRegion(ctx.params?.region as string);
  if (!region) return { notFound: true };
  const all = await loadCatalogLots();
  const lots = all.filter((l) => l.region === region.slug);
  const lotCounts = countLotsByMake(all, region.slug);
  const makes = sortMakesByInventory(getMakesForRegion(region.slug), lotCounts);
  return {
    props: {
      dictionary: getDictionary(),
      region,
      makes,
      lotCounts,
      regionLotCounts: countLotsByRegion(all),
      lots,
      pricingMode: regionPricingMode(region.slug),
    },
  };
};
