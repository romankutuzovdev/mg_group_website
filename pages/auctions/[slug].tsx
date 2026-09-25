"use client";

import { GetStaticPaths, GetStaticProps } from "next";
import { LotDetailView } from "@/components/auctions/lot-detail-view";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { loadLotBySlug } from "@/lib/auctions/repository";
import { buildSeoInventory } from "@/lib/auctions/seo-inventory";
import type { AuctionLot } from "@/lib/auctions/types";

interface Props {
  dictionary: Dictionary;
  lot: AuctionLot;
}

export default function LotDetailPage({ dictionary, lot }: Props) {
  return <LotDetailView dictionary={dictionary} lot={lot} />;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { getAuctionSsgLimit } = await import("@/lib/auctions/seo-inventory");
  const limit = getAuctionSsgLimit();
  if (limit <= 0) {
    return { paths: [], fallback: false };
  }
  const { auctionSlugs } = await buildSeoInventory();
  return {
    paths: auctionSlugs.slice(0, limit).map((slug) => ({ params: { slug } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps = async (ctx) => {
  const slug = String(ctx.params?.slug ?? "");
  const lot = await loadLotBySlug(slug);
  if (!lot) {
    return { notFound: true };
  }
  return {
    props: {
      dictionary: getDictionary(),
      lot,
    },
  };
};
