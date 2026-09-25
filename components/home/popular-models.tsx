import { LotCard } from "@/components/auctions/lot-card";
import { LinkButton } from "@/components/site/button";
import type { AuctionLot } from "@/lib/auctions/types";
import { pickDiverseAuctionLotsFrom } from "@/lib/auctions/example-picks";

export function PopularModels({ lots = [] }: { lots?: AuctionLot[] }) {
  const picked = pickDiverseAuctionLotsFrom(lots, 6);
  if (picked.length === 0) return null;

  return (
    <section className="bg-bg-base py-14 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="lux-kicker">Каталог</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Популярные модели
            </h2>
            <p className="mt-3 max-w-xl text-sm text-text-secondary sm:text-base">
              Реальные лоты с аукционов — фото с площадки, ставка и расчёт под ключ
            </p>
          </div>
          <LinkButton
            href="/avto/"
            variant="secondary"
            className="w-full shrink-0 sm:w-auto"
          >
            Все лоты
          </LinkButton>
        </div>

        <div className="lots-mobile-scroller -mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:mt-12 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 lg:gap-6">
          {picked.map((lot) => (
            <div
              key={lot.id}
              className="w-[min(100%,20.5rem)] shrink-0 snap-center sm:w-auto sm:min-w-0"
            >
              <LotCard lot={lot} />
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-accent/20 bg-bg-elevated p-5 text-center sm:mt-12 sm:p-8 md:p-12">
          <h3 className="font-display text-xl font-semibold sm:text-2xl">
            Не нашли нужный автомобиль?
          </h3>
          <p className="mt-2 text-sm text-text-secondary sm:text-base">
            Оставьте заявку и мы подберём авто по вашим критериям
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
            <LinkButton href="#car-finder" className="w-full sm:w-auto">
              Подобрать авто
            </LinkButton>
            <LinkButton href="/avto/" variant="secondary" className="w-full sm:w-auto">
              Каталог лотов
            </LinkButton>
          </div>
        </div>
      </div>
    </section>
  );
}
