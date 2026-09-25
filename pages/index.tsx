import { GetStaticProps } from "next";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import type { AuctionLot } from "@/lib/auctions/types";
import { loadFeaturedLiveLots } from "@/lib/auctions/repository";
import Hero from "@/components/Hero";
import Benefits from "@/components/Benefits";
import CarFinder from "@/components/CarFinder";
import Parts from "@/components/Parts";
import SEO from "@/components/SEO";
import { PartnersTicker } from "@/components/home/partners-ticker";
import { StatsBar } from "@/components/home/stats-bar";
import { CatalogShowcase } from "@/components/home/catalog-showcase";
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
}

export default function Home({ dictionary, featuredLots }: HomeProps) {
  return (
    <>
      <SEO dictionary={dictionary} lang="ru" />
      <Hero dictionary={dictionary} />
      <PartnersTicker />
      <StatsBar />
      <CatalogShowcase />
      <LiveAuctions initialLots={featuredLots} />
      <PopularModels />
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

export const getStaticProps: GetStaticProps = async () => {
  const dictionary = getDictionary();
  const featuredLots = await loadFeaturedLiveLots(4);

  return {
    props: {
      dictionary,
      featuredLots,
    },
  };
};
