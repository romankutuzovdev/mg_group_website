import { GetStaticProps } from "next";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import type { AuctionLot, AuctionRegion } from "@/lib/auctions/types";
import { fetchLotMeta } from "@/lib/api/client";
import {
  loadFeaturedLite,
  loadLotsPageLite,
  normalizeRegionCounts,
} from "@/lib/auctions/ssg-lite";
import { pickDiverseAuctionLotsFrom } from "@/lib/auctions/example-picks";
import { getMakesForRegion } from "@/lib/catalog";
import Hero from "@/components/Hero";
import Benefits from "@/components/Benefits";
import CarFinder from "@/components/CarFinder";
import Parts from "@/components/Parts";
import SEO from "@/components/SEO";
import { organizationJsonLd } from "@/components/catalog/seo";
import { PartnersTicker } from "@/components/home/partners-ticker";
import { StatsBar } from "@/components/home/stats-bar";
import {
  CatalogShowcase,
  type CatalogShowcaseData,
} from "@/components/home/catalog-showcase";
import { LiveAuctions } from "@/components/home/live-auctions";
import { Services } from "@/components/home/services";
import { PopularModels } from "@/components/home/popular-models";
import { Process } from "@/components/home/process";
import { ReviewsSection } from "@/components/home/reviews-section";
import { Team } from "@/components/pages/team";
import { CasesFeed } from "@/components/pages/cases-feed";
import { CtaSection } from "@/components/home/cta-section";

interface HomeProps {
  dictionary: Dictionary;
  featuredLots: AuctionLot[];
  showcase: CatalogShowcaseData;
  popularLots: AuctionLot[];
}

export default function Home({ dictionary, featuredLots, showcase, popularLots }: HomeProps) {
  return (
    <>
      <SEO dictionary={dictionary} lang="ru" path="/" jsonLd={organizationJsonLd()} />
      <Hero dictionary={dictionary} />
      <PartnersTicker />
      <StatsBar />
      <CatalogShowcase data={showcase} />
      <LiveAuctions initialLots={featuredLots} />
      <PopularModels lots={popularLots} />
      <Benefits dictionary={dictionary} />
      <Services />
      <Parts dictionary={dictionary} />
      <Process />
      <CarFinder dictionary={dictionary} />
      <ReviewsSection limit={3} />
      <Team />
      <CasesFeed limit={6} />
      <CtaSection />
    </>
  );
}

function usaMakeHref(makeName: string) {
  const found = getMakesForRegion("usa").find(
    (item) => item.name.toLowerCase() === makeName.trim().toLowerCase(),
  );
  return found ? `/avto/usa/${found.slug}/` : "/avto/usa/";
}

const EMPTY_COUNTS: Record<AuctionRegion, number> = {
  usa: 0,
  china: 0,
  korea: 0,
  uk: 0,
};

export const getStaticProps: GetStaticProps = async () => {
  const dictionary = getDictionary();
  const [featuredLots, meta, usaPage] = await Promise.all([
    loadFeaturedLite(4),
    fetchLotMeta().catch(() => null),
    loadLotsPageLite({ region: "usa", pageSize: 48 }),
  ]);
  const regionCounts = meta ? normalizeRegionCounts(meta) : {};
  const topFromMeta = (meta?.top_makes || [])
    .filter((row) => row.make && row.count > 0)
    .slice(0, 8)
    .map((row) => ({
      make: row.make,
      count: row.count,
      minBid: row.min_bid || 0,
      currency: (row.currency === "GBP" || row.currency === "KRW" ? row.currency : "USD") as
        | "USD"
        | "GBP"
        | "KRW",
      href: usaMakeHref(row.make),
    }));
  const showcase: CatalogShowcaseData = {
    total: meta?.total ?? usaPage.total,
    counts: {
      usa: regionCounts.usa ?? (usaPage.lots.length ? usaPage.total : 0),
      china: regionCounts.china ?? EMPTY_COUNTS.china,
      korea: regionCounts.korea ?? EMPTY_COUNTS.korea,
      uk: regionCounts.uk ?? EMPTY_COUNTS.uk,
    },
    topMakesUsa: topFromMeta,
  };

  return {
    props: {
      dictionary,
      featuredLots,
      showcase,
      popularLots: pickDiverseAuctionLotsFrom(
        usaPage.lots.length ? usaPage.lots : featuredLots,
        6,
      ),
    },
    ...(process.env.VERCEL === "1" ? { revalidate: 120 } : {}),
  };
};
