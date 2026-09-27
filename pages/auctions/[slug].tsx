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

/**
 * Lot pages must be served by Next.js (Header/Footer), never rewritten to the
 * Windows FastAPI fallback HTML ("Rebuild website").
 */
export default function LotDetailPage({ dictionary, lot: initialLot, slug: propSlug }: Props) {
  const router = useRouter();
  const routeSlug =
    typeof router.query.slug === "string"
      ? decodeURIComponent(router.query.slug)
      : Array.isArray(router.query.slug)
        ? decodeURIComponent(router.query.slug[0] || "")
        : "";
  const slug = (routeSlug || propSlug || "").trim();

  const [lot, setLot] = useState<AuctionLot | null>(initialLot);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialLot);

  useEffect(() => {
    setLot(initialLot);
  }, [initialLot]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!slug || slug === "__live__") {
      setError("Не указан лот");
      setLoading(false);
      return;
    }
    // SSG HTML is baked with the cover only (`imageUrl`). The live API keeps
    // the rest of the gallery in `imageUrls`, so always refresh after paint.
    const hasInitial = Boolean(initialLot && initialLot.slug === slug);
    if (!hasInitial) setLoading(true);

    let cancelled = false;
    fetchLotBySlug(slug)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          if (!hasInitial) {
            setError("Лот не найден или торги завершены");
            setLot(null);
          }
          return;
        }
        setLot(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!hasInitial) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки лота");
          setLot(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router.isReady, slug, initialLot]);

  if (!router.isReady || loading) {
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
  // Vercel / next dev: generate on demand (full _app shell).
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "development") {
    return { paths: [], fallback: "blocking" };
  }

  // Static export (Windows): only prebuilt slugs; otherwise FastAPI __live__ / CF Function.
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
  const dynamic =
    process.env.VERCEL === "1" || process.env.NODE_ENV === "development";

  if (dynamic) {
    let lot: AuctionLot | null = null;
    try {
      lot = await fetchLotBySlug(slug);
    } catch {
      lot = null;
    }
    return {
      props: { dictionary, lot, slug },
      ...(process.env.VERCEL === "1" ? { revalidate: 60 } : {}),
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
