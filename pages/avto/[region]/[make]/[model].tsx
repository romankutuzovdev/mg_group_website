import { GetStaticPaths, GetStaticProps } from "next";
import Link from "next/link";
import { AuctionsCatalog } from "@/components/auctions/auctions-catalog";
import { CatalogHero, CatalogSection } from "@/components/catalog/catalog-hero";
import {
  CatalogSEO,
  breadcrumbJsonLd,
  faqJsonLd,
  organizationJsonLd,
  serviceJsonLd,
} from "@/components/catalog/seo";
import { CityNavLinks, SeoCta, SeoFaq } from "@/components/seo/seo-blocks";
import { PageShell } from "@/components/layout/page-shell";
import {
  allCatalogPaths,
  catalogPath,
  getMake,
  getModel,
  getRegion,
  makeInRegion,
  modelPageDescription,
  modelPageTitle,
  type CatalogMake,
  type CatalogModel,
  type CatalogRegion,
  type CatalogRegionSlug,
} from "@/lib/catalog";
import { getRegionVisual } from "@/lib/catalog/region-visual";
import { CITIES, cityPath } from "@/lib/seo/cities";
import { catalogModelFaq } from "@/lib/seo/copy";
import { getDictionary } from "@/lib/dictionary";
import { loadCatalogLots } from "@/lib/auctions/repository";
import type { AuctionLot } from "@/lib/auctions/types";
import type { LotPricingMode } from "@/lib/auctions/lot-quote";
import { filterLotsForModel, countLotsByRegion } from "@/lib/catalog/match-lots";
import { RegionMosaic } from "@/components/catalog/region-mosaic";

type Props = {
  region: CatalogRegion;
  make: CatalogMake;
  model: CatalogModel;
  lots: AuctionLot[];
  regionLotCounts: Partial<Record<CatalogRegionSlug, number>>;
  pricingMode: LotPricingMode;
};

function regionPricingMode(slug: CatalogRegionSlug): LotPricingMode {
  return slug === "uk" ? "kit" : "restoration";
}

export default function AvtoModelPage({
  region,
  make,
  model,
  lots,
  regionLotCounts,
  pricingMode,
}: Props) {
  const path = catalogPath(region.slug, make.slug, model.slug);
  const visual = getRegionVisual(region.slug);
  const title = modelPageTitle(region, make, model);
  const description = modelPageDescription(region, make, model);
  const h1 = `${make.name} ${model.name}`;
  const faq = catalogModelFaq(region, make, model);
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
        image={model.image || undefined}
        jsonLd={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: "Главная", path: "/" },
            { name: "Каталог авто", path: catalogPath() },
            { name: region.title, path: catalogPath(region.slug) },
            { name: make.name, path: catalogPath(region.slug, make.slug) },
            { name: model.name, path },
          ]),
          serviceJsonLd({ name: h1, description, path }),
          faqJsonLd(faq),
        ]}
      />

      <PageShell bare>
        <CatalogHero
          compact
          title={h1}
          description={`Из ${region.nameGenitive} под ключ: ставка, логистика и таможня в Беларусь.`}
          crumbs={[
            { href: catalogPath(), label: "Каталог авто" },
            { href: catalogPath(region.slug), label: region.title },
            { href: catalogPath(region.slug, make.slug), label: make.name },
            { label: model.name },
          ]}
          wash={visual.wash}
          glow={visual.glow}
          ctas={[
            { href: lots.length ? "#lots" : "/calculator/", label: lots.length ? "Смотреть лоты" : "Просчёт", variant: "primary" },
            { href: catalogPath(region.slug, make.slug), label: `Все ${make.name}`, variant: "outline" },
          ]}
          media={
            model.image ? (
              <div className="relative h-40 w-64 overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={model.image}
                  alt={`${make.name} ${model.name}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : make.logo ? (
              <div className="flex h-32 w-32 items-center justify-center rounded-2xl border border-white/10 bg-white/95 p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={make.logo} alt={make.name} className="max-h-full max-w-full object-contain" />
              </div>
            ) : null
          }
        />

        <div className="mx-auto max-w-7xl space-y-12 px-3 py-8 sm:px-4 sm:py-12 lg:px-6">
          <RegionMosaic lotCounts={regionLotCounts} active={region.slug} variant="strip" />

          {lots.length > 0 ? (
            <CatalogSection
              id="lots"
              title={`${make.name} ${model.name} — лоты`}
              subtitle="Ставка и ориентир стоимости под ключ."
            >
              <AuctionsCatalog
                lots={lots}
                region={catalogRegion}
                pricingMode={pricingMode}
                initialMake={make.name}
                initialModel={model.name}
              />
            </CatalogSection>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-5 py-10 text-center">
              <p className="text-sm text-zinc-500">
                Сейчас нет живых лотов этой модели.{" "}
                <Link href="/calculator/" className="font-semibold text-primary hover:underline">
                  Рассчитайте стоимость
                </Link>{" "}
                или оставьте заявку на подбор.
              </p>
            </div>
          )}

          <CityNavLinks cities={CITIES} hrefFor={(s) => cityPath(s, region.slug, make.slug)} />
          <SeoFaq items={faq} />
          <SeoCta />
        </div>
      </PageShell>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: allCatalogPaths()
    .filter((p) => p.make && p.model)
    .map((p) => ({
      params: { region: p.region, make: p.make!, model: p.model! },
    })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const region = getRegion(ctx.params?.region as string);
  const makeSlug = ctx.params?.make as string;
  const modelSlug = ctx.params?.model as string;
  const make = getMake(makeSlug);
  const model = getModel(makeSlug, modelSlug);
  if (!region || !make || !model || !makeInRegion(makeSlug, region.slug)) {
    return { notFound: true };
  }

  const all = await loadCatalogLots();
  const lots = filterLotsForModel(all, make, model.slug, region.slug, 500);

  return {
    props: {
      dictionary: getDictionary(),
      region,
      make,
      model,
      lots,
      regionLotCounts: countLotsByRegion(all),
      pricingMode: regionPricingMode(region.slug),
    },
  };
};
