import { GetStaticProps } from "next";
import { getDictionary, type Dictionary } from "@/lib/dictionary";
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
import { BoughtCarsSection, ManagerPicksSection } from "@/components/home/showcase-picks";

type HomeProps = {
  dictionary: Dictionary;
};

export default function Home({ dictionary }: HomeProps) {
  return (
    <>
      <SEO dictionary={dictionary} lang="ru" path="/" jsonLd={organizationJsonLd()} />
      <Hero dictionary={dictionary} />
      <StatsBar />
      <HomeDirections />
      <HomeShowcase />
      <ManagerPicksSection kind="kit" />
      <BoughtCarsSection />
      <Process />
      <Benefits dictionary={dictionary} />
      <CasesFeed limit={3} hideWhenEmpty />
      <ReviewsSection limit={3} />
      <CarFinder dictionary={dictionary} />
    </>
  );
}

export const getStaticProps: GetStaticProps<HomeProps> = async () => ({
  props: { dictionary: getDictionary() },
});
