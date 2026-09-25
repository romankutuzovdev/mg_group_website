import { GetStaticPaths, GetStaticProps } from "next";
import { AuctionsCatalog } from "@/components/auctions/auctions-catalog";
import { CatalogHero, CatalogSection } from "@/components/catalog/catalog-hero";
import { ModelCard } from "@/components/catalog/cards";
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
  catalogPath,
  getMake,
  getMakesForRegion,
  getRegion,
  makeInRegion,
  makePageDescription,
  makePageTitle,
  REGION_ORDER,
  type CatalogMake,
  type CatalogRegion,
  type CatalogRegionSlug,
} from "@/lib/catalog";
import { getRegionVisual } from "@/lib/catalog/region-visual";
import { CITIES, cityPath } from "@/lib/seo/cities";
import { catalogMakeFaq } from "@/lib/seo/copy";
import { getDictionary } from "@/lib/dictionary";
import { loadCatalogLots } from "@/lib/auctions/repository";
import type { AuctionLot } from "@/lib/auctions/types";
import type { LotPricingMode } from "@/lib/auctions/lot-quote";
import { filterLotsForMake, countLotsByModel, countLotsByRegion } from "@/lib/catalog/match-lots";

type Props = {
  region: CatalogRegion;
  make: CatalogMake;
  lots: AuctionLot[];
  modelLotCounts: Record<string, number>;
  regionLotCounts: Partial<Record<CatalogRegionSlug, number>>;
  pricingMode: LotPricingMode;
};

function regionPricingMode(slug: CatalogRegionSlug): LotPricingMode {
  return slug === "uk" ? "kit" : "restoration";
}

export default function AvtoMakePage({
  region,
  make,
  lots,
  modelLotCounts,
  regionLotCounts,
  pricingMode,
}: Props) {
  const path = catalogPath(region.slug, make.slug);
  const visual = getRegionVisual(region.slug);
  const title = makePageTitle(region, make);
  const description = makePageDescription(region, make);
  const h1 = `${make.name} из ${region.nameGenitive}`;
  const faq = catalogMakeFaq(region, make);
  const models = [...make.models].sort((a, b) => {
    const ca = modelLotCounts[a.slug] || 0;
    const cb = modelLotCounts[b.slug] || 0;
    if (ca !== cb) return cb - ca;
    return a.name.localeCompare(b.name, "en");
  });
  const catalogRegion =
    region.slug === "usa" ||
    region.slug === "uk" ||
    region.slug === "korea" ||
    region.slug === "china"
      ? region.slug
      : undefined;

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
            { name: region.title, path: catalogPath(region.slug) },
            { name: make.name, path },
          ]),
          serviceJsonLd({ name: h1, description, path }),
          itemListJsonLd(
            models.map((model) => ({
              name: `${make.name} ${model.name}`,
              path: catalogPath(region.slug, make.slug, model.slug),
            })),
          ),
          faqJsonLd(faq),
        ]}
      />

      <PageShell bare>
        <CatalogHero
          compact
          title={h1}
          description={`Актуальные лоты и модели ${make.name}: ставка, просчёт под ключ, доставка из ${region.nameGenitive}.`}
          crumbs={[
            { href: catalogPath(), label: "Каталог авто" },
            { href: catalogPath(region.slug), label: region.title },
            { label: make.name },
          ]}
          wash={visual.wash}
          glow={visual.glow}
          ctas={[
            { href: "#models", label: "Модели", variant: "primary" },
            ...(lots.length
              ? [{ href: "#lots", label: "Лоты", variant: "outline" as const }]
              : []),
            { href: "/calculator/", label: "Просчёт", variant: "outline" },
          ]}
          media={
            make.logo ? (
              <div className="flex h-36 w-36 items-center justify-center rounded-2xl border border-white/10 bg-white/95 p-6 shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={make.logo} alt={make.name} className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <p className="font-display text-7xl font-bold text-white/15" aria-hidden>
                {make.name.slice(0, 1)}
              </p>
            )
          }
        />

        <div className="mx-auto max-w-7xl space-y-12 px-3 py-8 sm:px-4 sm:py-12 lg:px-6">
          <RegionMosaic lotCounts={regionLotCounts} active={region.slug} variant="strip" />

          <CatalogSection id="models" title={`Модели ${make.name}`}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {models.map((model) => (
                <ModelCard
                  key={model.slug}
                  regionSlug={region.slug}
                  makeSlug={make.slug}
                  makeName={make.name}
                  model={model}
                  lotCount={modelLotCounts[model.slug] || 0}
                />
              ))}
            </div>
          </CatalogSection>

          <CatalogSection
            id="lots"
            title={`Актуальные лоты ${make.name}`}
            subtitle={
              lots.length
                ? "Ставка и ориентир стоимости под ключ."
                : "Пока нет живых лотов — подберём под заказ."
            }
          >
            {lots.length > 0 ? (
              <AuctionsCatalog
                lots={lots}
                region={catalogRegion}
                pricingMode={pricingMode}
                initialMake={make.name}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-5 py-8 text-center text-sm text-zinc-500">
                Сейчас нет живых лотов {make.name} из {region.nameGenitive}. Выберите модель выше или{" "}
                <a href="/calculator/" className="font-semibold text-primary hover:underline">
                  сделайте просчёт
                </a>
                .
              </div>
            )}
          </CatalogSection>

          <CityNavLinks
            cities={CITIES}
            hrefFor={(s) => cityPath(s, region.slug, make.slug)}
          />
          <SeoFaq items={faq} />
          <SeoCta />
        </div>
      </PageShell>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  // Always emit every catalog make×region. Paths keyed only on live lots at build
  // time caused /avto/usa/tesla/ → 404 on Vercel when API was empty during SSG.
  const paths = REGION_ORDER.flatMap((region) =>
    getMakesForRegion(region).map((make) => ({
      params: { region, make: make.slug },
    })),
  );
  return {
    paths,
    // Vercel (no static export): allow on-demand pages; Windows export requires false.
    fallback: process.env.VERCEL === "1" ? "blocking" : false,
  };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const region = getRegion(ctx.params?.region as string);
  const makeSlug = ctx.params?.make as string;
  const make = getMake(makeSlug);
  if (!region || !make || !makeInRegion(makeSlug, region.slug)) {
    return { notFound: true };
  }

  const all = await loadCatalogLots();
  const lots = filterLotsForMake(all, make, region.slug, 500);
  const modelLotCounts = countLotsByModel(all, make, region.slug);

  return {
    props: {
      dictionary: getDictionary(),
      region,
      make,
      lots,
      modelLotCounts,
      regionLotCounts: countLotsByRegion(all),
      pricingMode: regionPricingMode(region.slug),
    },
  };
};
