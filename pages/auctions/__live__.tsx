"use client";

import { GetStaticProps } from "next";
import { useEffect, useState } from "react";
import { LotDetailView } from "@/components/auctions/lot-detail-view";
import { fetchLotBySlug } from "@/lib/api/client";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import type { AuctionLot } from "@/lib/auctions/types";

type Props = { dictionary: Dictionary };

declare global {
  interface Window {
    __MG_LOT_SLUG__?: string;
  }
}

/**
 * Full site shell (Header/Footer via _app) + client fetch by slug.
 * Windows FastAPI serves this HTML for any /auctions/{slug}/ that was not SSG'd.
 */
export default function LiveAuctionLotPage({ dictionary }: Props) {
  const [lot, setLot] = useState<AuctionLot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fromInject =
      typeof window !== "undefined" ? window.__MG_LOT_SLUG__ : undefined;
    const fromPath =
      typeof window !== "undefined"
        ? window.location.pathname.match(/\/auctions\/([^/]+)/i)?.[1]
        : undefined;
    const raw = decodeURIComponent(fromInject || fromPath || "").trim();
    if (!raw || raw === "__live__") {
      setError("Не указан лот");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchLotBySlug(raw)
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
  }, []);

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

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: { dictionary: getDictionary() },
});
