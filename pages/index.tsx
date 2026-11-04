import { GetStaticProps } from "next";
import { getDictionary, type Dictionary } from "@/lib/dictionary";
import type { AuctionLot, AuctionRegion } from "@/lib/auctions/types";
import { fetchLotMeta } from "@/lib/api/client";
import { loadLotsPageLite, normalizeRegionCounts } from "@/lib/auctions/ssg-lite";
import { pickShowcaseLots } from "@/lib/auctions/showcase-picks";
import Hero from "@/components/Hero";
import Benefits from "@/components/Benefits";
import CarFinder from "@/components/CarFinder";
import SEO from "@/components/SEO";
import { organizationJsonLd } from "@/components/catalog/seo";
import { HomeDirections } from "@/components/home/home-directions";
import { StatsBar } from "@/components/home/stats-bar";
import { HomeShowcase } from "@/components/home/home-showcase";
import { Process } from "@/components/home/process";
import { ReviewsSection } from "@/components/home/reviews-section";
import { CasesFeed } from "@/components/pages/cases-feed";

type HomeProps = {
  dictionary: Dictionary;
  regionalLots: Record<AuctionRegion, AuctionLot[]>;
  counts: Record<AuctionRegion, number>;
};

export default function Home({ dictionary, regionalLots, counts }: HomeProps) {
  return (
    <>
      <SEO dictionary={dictionary} lang="ru" path="/" jsonLd={organizationJsonLd()} />
      <Hero dictionary={dictionary} />
      <StatsBar />
      <HomeDirections />
      <HomeShowcase initialLots={regionalLots} counts={counts} />
      <Process />
      <Benefits dictionary={dictionary} />
      <CasesFeed limit={3} hideWhenEmpty />
      <ReviewsSection limit={3} />
      <CarFinder dictionary={dictionary} />
    </>
  );
}

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const regions: AuctionRegion[] = ["usa", "china", "korea", "uk"];
  const [meta, ...pages] = await Promise.all([
    fetchLotMeta().catch(() => null),
    ...regions.map((region) => loadLotsPageLite({ region, pageSize: 12, ownPhoto: true })),
  ]);
  const metaCounts = meta ? normalizeRegionCounts(meta) : {};
  const regionalLots = {} as HomeProps["regionalLots"];
  const counts = {} as HomeProps["counts"];
  regions.forEach((region, index) => {
    regionalLots[region] = pickShowcaseLots(pages[index].lots.filter((lot) => lot.region === region), 6);
    counts[region] = metaCounts[region] ?? pages[index].total;
  });
  return {
    props: { dictionary: getDictionary(), regionalLots, counts },
    ...(process.env.VERCEL === "1" ? { revalidate: 120 } : {}),
  };
};
