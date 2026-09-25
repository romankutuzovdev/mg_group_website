import Link from "next/link";
import { LinkButton } from "@/components/site/button";
import { getCatalogLots } from "@/lib/auctions/repository";
import type { AuctionRegion } from "@/lib/auctions/types";
import { REGION_LABELS } from "@/lib/auctions/types";
import { getMakesForRegion } from "@/lib/catalog";

type RegionTab = {
  id: AuctionRegion;
  href: string;
  label: string;
};

const TABS: RegionTab[] = [
  { id: "usa", href: "/avto/usa/", label: REGION_LABELS.usa },
  { id: "china", href: "/avto/china/", label: REGION_LABELS.china },
  { id: "korea", href: "/avto/korea/", label: REGION_LABELS.korea },
  { id: "uk", href: "/avto/uk/", label: REGION_LABELS.uk },
];

type MakeBucket = {
  make: string;
  count: number;
  minBid: number;
  currency: "USD" | "GBP" | "KRW";
  href: string;
};

function makeHref(region: AuctionRegion, makeName: string) {
  const found = getMakesForRegion(region).find(
    (m) => m.name.toLowerCase() === makeName.trim().toLowerCase(),
  );
  return found ? `/avto/${region}/${found.slug}/` : `/avto/${region}/`;
}

function formatMoney(amount: number, currency: string) {
  const cur = currency === "GBP" ? "GBP" : currency === "KRW" ? "KRW" : "USD";
  return new Intl.NumberFormat(cur === "GBP" ? "en-GB" : cur === "KRW" ? "ko-KR" : "en-US", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  }).format(amount);
}

function topMakes(region: AuctionRegion, limit = 8): MakeBucket[] {
  const byMake = new Map<string, MakeBucket>();
  for (const lot of getCatalogLots()) {
    if (lot.region !== region) continue;
    const key = lot.make.trim().toLowerCase();
    if (!key) continue;
    const existing = byMake.get(key);
    if (!existing) {
      byMake.set(key, {
        make: lot.make,
        count: 1,
        minBid: lot.currentBid,
        currency: lot.currency,
        href: makeHref(region, lot.make),
      });
    } else {
      existing.count += 1;
      if (lot.currentBid < existing.minBid) {
        existing.minBid = lot.currentBid;
        existing.currency = lot.currency;
      }
    }
  }
  return [...byMake.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function CatalogShowcase() {
  const lots = getCatalogLots();
  const total = lots.length;
  const counts = TABS.reduce(
    (acc, tab) => {
      acc[tab.id] = lots.filter((l) => l.region === tab.id).length;
      return acc;
    },
    {} as Record<AuctionRegion, number>,
  );
  const buckets = topMakes("usa", 8);

  return (
    <section id="catalog-showcase" className="border-t border-border bg-white py-14 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="lux-kicker">Каталог</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Выберите авто с аукциона
            </h2>
            <p className="mt-3 text-sm text-text-secondary sm:text-base">
              Сейчас в каталоге{" "}
              <span className="font-semibold tabular-nums text-zinc-900">
                {total.toLocaleString("ru-RU")}
              </span>{" "}
              лотов. Ставка, сбор и ориентир под ключ — на карточке.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/avto/" className="w-full sm:w-auto">
              Весь каталог
            </LinkButton>
            <LinkButton href="/calculator/" variant="secondary" className="w-full sm:w-auto">
              Калькулятор
            </LinkButton>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-4 transition hover:border-accent/40 hover:bg-white"
            >
              <p className="text-sm font-semibold text-zinc-900">{tab.label}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-[#0D3F10]">
                {counts[tab.id].toLocaleString("ru-RU")}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">лотов в каталоге</p>
            </Link>
          ))}
        </div>

        <div className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
              Популярные марки — США
            </h3>
            <Link
              href="/avto/usa/"
              className="text-sm font-medium text-accent-dark underline underline-offset-2"
            >
              Все авто из США →
            </Link>
          </div>

          {buckets.length === 0 ? (
            <p className="mt-4 text-sm text-text-secondary">Лотов США пока нет.</p>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {buckets.map((bucket) => (
                <li key={bucket.make}>
                  <Link
                    href={bucket.href}
                    className="group flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-accent/40 hover:shadow-sm"
                  >
                    <p className="font-display text-lg font-semibold tracking-tight text-zinc-900 group-hover:text-accent-dark">
                      {bucket.make}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {bucket.count.toLocaleString("ru-RU")} в каталоге
                    </p>
                    <p className="mt-auto pt-4 text-sm font-semibold tabular-nums text-[#0D3F10]">
                      от {formatMoney(bucket.minBid, bucket.currency)}
                    </p>
                    <span className="mt-1 text-[11px] font-medium text-accent-dark">
                      Смотреть →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
