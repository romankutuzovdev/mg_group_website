import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import { LotDetailView } from "@/components/auctions/lot-detail-view";
import { fetchPublicLotPage, type PublicLotPage } from "@/lib/api/client";
import { buildSeoInventory, getAuctionSsgLimit } from "@/lib/auctions/seo-inventory";
import { getDictionary, type Dictionary } from "@/lib/dictionary";

type Props = { dictionary: Dictionary; auctionPage: PublicLotPage };

export default function LotDetailPage({ dictionary, auctionPage }: Props) {
  const [refresh, setRefresh] = useState<{ initial: PublicLotPage; page: PublicLotPage | null }>();
  useEffect(() => {
    let active = true;
    // An ISR snapshot may predate a gallery update. Keep the server-rendered
    // details on a transient API failure, and honor a confirmed withdrawal.
    fetchPublicLotPage(auctionPage.lot.slug)
      .then(page => { if (active) setRefresh({ initial: auctionPage, page }); })
      .catch(() => {});
    return () => { active = false; };
  }, [auctionPage]);
  const page = refresh?.initial === auctionPage ? refresh.page : auctionPage;
  if (!page) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <Head><title>Лот не найден | MG.GROUP</title><meta name="robots" content="noindex" /></Head>
        <h1>Лот не найден</h1>
        <a className="text-accent-dark" href="/avto/">К каталогу авто</a>
      </div>
    );
  }
  return <LotDetailView dictionary={dictionary} lot={page.lot} preview={page.preview} />;
}

export const getStaticPaths: GetStaticPaths = async () => {
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "development") {
    return { paths: [], fallback: "blocking" };
  }
  const limit = getAuctionSsgLimit();
  if (limit <= 0) return { paths: [], fallback: false };
  const { auctionSlugs } = await buildSeoInventory();
  return {
    paths: auctionSlugs.slice(0, limit).map((slug) => ({ params: { slug } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug ?? "");
  // A failed API request must propagate to Next's 5xx / ISR retry path.
  const page = await fetchPublicLotPage(slug);
  const cache = process.env.VERCEL === "1" ? { revalidate: 60 } : {};
  if (!page) return { notFound: true, ...cache };
  if (page.lot.slug !== slug) {
    return { redirect: { destination: `/auctions/${encodeURIComponent(page.lot.slug)}/`, permanent: true }, ...cache };
  }
  return { props: { dictionary: getDictionary(), auctionPage: page }, ...cache };
};
