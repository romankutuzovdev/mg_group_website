"use client";

import { useEffect, useState } from "react";
import { LotCard } from "@/components/auctions/lot-card";
import { LinkButton } from "@/components/site/button";
import { fetchFeaturedLots } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import type { AuctionLot } from "@/lib/auctions/types";

type Props = {
  initialLots?: AuctionLot[];
};

export function LiveAuctions({ initialLots = [] }: Props) {
  const [lots, setLots] = useState<AuctionLot[]>(initialLots);

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    fetchFeaturedLots(4)
      .then((items) => {
        if (!cancelled && items.length) setLots(items);
      })
      .catch(() => {
        /* keep initial / empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (lots.length === 0) return null;

  return (
    <section id="live-auctions" className="border-t border-border bg-bg-elevated py-14 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="lux-kicker">Аукционы</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Лоты с аукционов США и Англии
            </h2>
            <p className="mt-3 text-sm text-text-secondary sm:mt-4 sm:text-base">
              Copart, IAAI и Copart UK. Выберите направление: авто под заказ или доноры под
              машинокомплект.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-dark">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
            </span>
            Идут сейчас
          </span>
        </div>

        <div className="lots-mobile-scroller -mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:mt-12 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
          {lots.map((lot) => (
            <div
              key={lot.id}
              className="w-[min(100%,20.5rem)] shrink-0 snap-center sm:w-auto sm:min-w-0"
            >
              <LotCard lot={lot} />
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:mt-10 sm:flex-row">
          <LinkButton href="/avto/" size="lg" className="w-full sm:w-auto">
            Каталог авто
          </LinkButton>
          <LinkButton
            href="/mashinokomplekt/#lots"
            size="lg"
            variant="secondary"
            className="w-full sm:w-auto"
          >
            Машинокомплекты
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
