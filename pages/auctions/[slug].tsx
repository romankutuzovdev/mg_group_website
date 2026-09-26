"use client";

import { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { LotDetailView } from "@/components/auctions/lot-detail-view";
import { fetchLotBySlug } from "@/lib/api/client";
import { loadLotBySlug } from "@/lib/auctions/repository";
import { buildSeoInventory, getAuctionSsgLimit } from "@/lib/auctions/seo-inventory";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import type { AuctionLot } from "@/lib/auctions/types";

interface Props {
  dictionary: Dictionary;
  /** Preloaded on SSG / ISR when available */
  lot: AuctionLot | null;
  slug: string;
}

const isVercel = process.env.VERCEL === "1";
const isDev = process.env.NODE_ENV === "development";
/** Dynamic lot pages with full _app shell (Header/Footer) */
const useDynamicLots = isVercel || isDev;

export default function LotDetailPage({ dictionary, lot: initialLot, slug: propSlug }: Props) {
  const router = useRouter();
  const routeSlug = typeof router.query.slug === "string" ? router.query.slug : "";
  const slug = (routeSlug || propSlug || "").trim();

  const [lot, setLot] = useState<AuctionLot | null>(initialLot);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialLot);

  useEffect(() => {
    setLot(initialLot);
  }, [initialLot]);

  useEffect(() => {
    if (!slug || slug === "__live__") {
      setError("Не указан лот");
      setLoading(false);
      return;
    }
    if (initialLot && initialLot.slug === slug) {
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchLotBySlug(slug)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setError("Лот не найден или торги завершены");
          setLot(null);
          return;
        }
        setLot(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Ошибка загрузки лота");
        setLot(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, initialLot]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center text-sm text-text-secondary">
        Загрузка лота…
      </div>
    );
  }

  if (error || !lot) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-xl font-semibold">Лот не найден</h1>
        <p className="mt-2 text-sm text-text-secondary">{error || "Страница недоступна"}</p>
        <a href="/avto/" className="mt-6 inline-flex text-sm font-medium text-accent-dark underline">
          ← К каталогу авто
        </a>
      </div>
    );
  }

  return <LotDetailView dictionary={dictionary} lot={lot} />;
}

export const getStaticPaths: GetStaticPaths = async () => {
  if (useDynamicLots) {
    // On-demand pages with full _app shell (Header / Footer / nav).
    return { paths: [], fallback: "blocking" };
  }

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

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug ?? "").trim();
  const dictionary = getDictionary();

  if (useDynamicLots) {
    let lot: AuctionLot | null = null;
    try {
      // Direct slug fetch only — never loadCatalogLots() (25k items).
      lot = await fetchLotBySlug(slug);
    } catch {
      lot = null;
    }
    return {
      props: { dictionary, lot, slug },
      ...(isVercel ? { revalidate: 60 } : {}),
    };
  }

  const lot = await loadLotBySlug(slug);
  if (!lot) {
    return { notFound: true };
  }
  return {
    props: { dictionary, lot, slug },
  };
};
