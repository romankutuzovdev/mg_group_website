import type { GetStaticProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import { LotDetailView } from "@/components/auctions/lot-detail-view";
import type { PublicLotPage } from "@/lib/api/client";
import { getDictionary, type Dictionary } from "@/lib/dictionary";

type Props = { dictionary: Dictionary; auctionPage: PublicLotPage | null };

// FastAPI and Cloudflare fill these markers in the exported HTML. The same
// response is supplied as Next page props, so the first React render matches.
const template = {
  title: "__MG_LOT_title__", name: "__MG_LOT_name__",
  description: "__MG_LOT_description__", canonical: "__MG_LOT_canonical__",
  priceLabel: "__MG_LOT_priceLabel__", price: "__MG_LOT_price__",
  number: "__MG_LOT_number__", status: "__MG_LOT_status__", robots: "__MG_LOT_robots__",
};

export default function LiveAuctionLotPage({ dictionary, auctionPage }: Props) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (hydrated && auctionPage) {
    return <LotDetailView dictionary={dictionary} lot={auctionPage.lot} preview={auctionPage.preview} />;
  }

  const preview = auctionPage?.preview || template;
  return (
    <>
      <Head>
        <title>{preview.title}</title>
        <meta name="description" content={preview.description} />
        <meta name="robots" content={preview.robots} />
        <link rel="canonical" href={preview.canonical} />
        <meta property="og:title" content={preview.title} />
        <meta property="og:description" content={preview.description} />
        <meta property="og:url" content={preview.canonical} />
      </Head>
      <article className="mx-auto max-w-7xl px-4 pb-10 pt-24 sm:px-6 lg:px-8">
        <a className="text-sm text-accent-dark" href="/avto/">← К каталогу авто</a>
        <p className="mt-4 text-sm">Лот №{preview.number}</p>
        <h1 className="mt-2 font-display text-2xl font-bold md:text-3xl">{preview.name}</h1>
        <dl className="mt-6">
          <dt className="text-sm text-text-muted">{preview.priceLabel}</dt>
          <dd className="text-2xl font-bold">{preview.price}</dd>
          <dt className="mt-4 text-sm text-text-muted">Статус лота</dt>
          <dd>{preview.status}</dd>
        </dl>
      </article>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  // Only the static origin needs the private rendering template.
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "development") return { notFound: true };
  return { props: { dictionary: getDictionary(), auctionPage: null } };
};
