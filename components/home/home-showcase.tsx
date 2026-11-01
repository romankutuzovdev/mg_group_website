"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { LotCard } from "@/components/auctions/lot-card";
import { LinkButton } from "@/components/site/button";
import { fetchLotsPage } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import { pickShowcaseLots } from "@/lib/auctions/showcase-picks";
import { REGION_LABELS, type AuctionLot, type AuctionRegion } from "@/lib/auctions/types";

const REGIONS: AuctionRegion[] = ["usa", "china", "korea", "uk"];
const SOURCES: Record<AuctionRegion, string> = {
  usa: "Copart · IAAI · Manheim",
  china: "Che168 · Guazi",
  korea: "Encar",
  uk: "Copart UK · Salvage Market",
};

type Props = {
  initialLots: Record<AuctionRegion, AuctionLot[]>;
  counts: Record<AuctionRegion, number>;
};

export function HomeShowcase({ initialLots, counts }: Props) {
  const [region, setRegion] = useState<AuctionRegion>("usa");
  const [lots, setLots] = useState(initialLots);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchLotsPage({ region, page: 1, pageSize: 12, sort: "date", order: "desc" })
      .then((result) => {
        if (cancelled) return;
        const items = pickShowcaseLots(result.items.filter((lot) => lot.region === region), 6);
        setLots((previous) => ({ ...previous, [region]: items }));
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [region, retry]);

  const visible = lots[region] || [];
  return (
    <section id="catalog-showcase" className="scroll-mt-20 bg-bg-base py-16 sm:py-20 lg:py-24" aria-labelledby="home-showcase-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="lux-kicker">Автомобили со всего мира</p>
            <h2 id="home-showcase-title" className="mt-4 font-display text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.06] tracking-tight">Следующая остановка —<br /><span className="text-text-secondary">ваш гараж.</span></h2>
          </div>
          <Link href="/avto/" className="inline-flex min-h-11 w-fit items-center gap-3 text-sm font-medium text-accent-dark underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Весь каталог <ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
        </div>

        <div role="tablist" aria-label="Страна покупки автомобиля" className="mt-9 flex gap-1 border-b border-border sm:gap-5">
          {REGIONS.map((item, index) => (
            <button key={item} ref={(element) => { tabs.current[index] = element; }} id={`home-tab-${item}`} type="button" role="tab" aria-selected={region === item} aria-controls={`home-panel-${item}`} tabIndex={region === item ? 0 : -1}
              onClick={() => { setRegion(item); setError(false); }}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % REGIONS.length;
                else if (event.key === "ArrowLeft") next = (index + REGIONS.length - 1) % REGIONS.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = REGIONS.length - 1;
                else return;
                event.preventDefault();
                setRegion(REGIONS[next]);
                setError(false);
                tabs.current[next]?.focus();
              }}
              className={`relative min-h-14 flex-1 cursor-pointer border-b-2 px-1 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-none sm:px-4 sm:text-base ${region === item ? "border-accent-dark text-text-primary" : "border-transparent text-text-secondary hover:border-border-strong hover:text-text-primary"}`}>
              {REGION_LABELS[item]}<span className="ml-2 hidden text-xs tabular-nums text-text-muted sm:inline">{counts[item] > 0 ? counts[item].toLocaleString("ru-RU") : ""}</span>
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`home-panel-${region}`} aria-labelledby={`home-tab-${region}`} tabIndex={0} className="pt-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary sm:text-sm">
            <p>{SOURCES[region]}</p>
            <p>Ставка и ориентир под ключ — отдельно</p>
          </div>
          <div aria-live="polite" role="status" className="mt-3 text-sm text-text-secondary">
            {loading ? "Обновляем предложения…" : error ? "Не удалось обновить предложения." : ""}
            {error && <button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-2 min-h-11 cursor-pointer font-medium text-accent-dark underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Повторить</button>}
          </div>
          {visible.length ? (
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((lot) => <LotCard key={lot.id} lot={lot} pricingMode="restoration" />)}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-border bg-white px-6 py-14 text-center">
              <h3 className="text-xl font-semibold">{loading ? "Загружаем автомобили" : error ? "Предложения временно недоступны" : "Подберём автомобиль под ваш запрос"}</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-secondary">{loading ? "Скоро здесь появятся фотографии и стоимость лотов." : "Оставьте пожелания к модели и бюджету — поможем найти подходящий вариант."}</p>
              <LinkButton href="#car-finder" variant="secondary" className="mt-6">Заказать подбор</LinkButton>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col justify-between gap-5 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="max-w-lg text-xs leading-relaxed text-text-secondary">Стоимость под ключ — предварительный расчёт. Итог зависит от ставки, логистики и таможенных платежей.</p>
          <LinkButton href={`/avto/${region}/`} variant="secondary" className="shrink-0">Все авто: {REGION_LABELS[region]} <ArrowRight className="h-4 w-4" aria-hidden /></LinkButton>
        </div>
      </div>
    </section>
  );
}
