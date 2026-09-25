"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LinkButton } from "@/components/site/button";
import { fetchCases, type ApiCase } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import {
  caseSavedAmount,
  caseSavingsPercent,
  casesSummary,
  formatCaseMoney,
  getCasesFeedItems,
  type ClientCase,
} from "@/lib/cases";

type Props = {
  limit?: number;
  showHeaderLink?: boolean;
};

function mapApiCase(item: ApiCase): ClientCase {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    image: item.image,
    region: item.region === "Англия" ? "Англия" : "США",
    source: item.source,
    budget: item.budget,
    market: item.market,
    currency: item.currency,
    days: item.days,
    story: item.story,
    result: "Под ключ",
    href: item.href,
  };
}

export function CasesFeed({ limit, showHeaderLink = true }: Props) {
  const [items, setItems] = useState<ClientCase[]>(() => getCasesFeedItems(limit));

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    fetchCases(limit ?? 12)
      .then((apiItems) => {
        if (cancelled || !apiItems.length) return;
        setItems(apiItems.map(mapApiCase));
      })
      .catch(() => {
        /* keep local fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  const summary = casesSummary(items);

  return (
    <section id="cases" className="scroll-mt-28 border-t border-border bg-bg-base py-14 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="lux-kicker">Кейсы и просчёты</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              От заявки до ключей — с цифрами
            </h2>
            <p className="mt-4 text-sm text-text-secondary sm:text-base">
              Живые лоты из каталога с расчётом под ключ: ставка, доставка, разборка и ориентир по рынку
              РБ.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-border bg-bg-elevated px-4 py-2">
              {summary.count} примеров
            </span>
            <span className="rounded-full border border-border bg-bg-elevated px-4 py-2">
              ~{summary.avgDays} дней в пути
            </span>
            <span className="rounded-full border border-accent/25 bg-accent/10 px-4 py-2 text-accent-dark">
              ср. выгода {summary.avgSavings}%
            </span>
          </div>
        </div>

        <div className="mt-10 flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-12 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-3 [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <CaseCard key={item.id} item={item} />
          ))}
        </div>

        {showHeaderLink ? (
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <LinkButton href="/mashinokomplekt/#lots">Каталог лотов</LinkButton>
            <LinkButton href="/kuplennye-mashinokomplekty/" variant="secondary">
              Купленные комплекты
            </LinkButton>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CaseCard({ item }: { item: ClientCase }) {
  const savings = caseSavingsPercent(item);
  const saved = caseSavedAmount(item);

  const inner = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-100">
        <Image
          src={item.image}
          alt={item.title}
          fill
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
          sizes="(max-width: 640px) 80vw, (max-width: 1280px) 40vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
            {item.region} · {item.source}
          </span>
          <span className="rounded-full bg-[#22c55e] px-2.5 py-1 text-[10px] font-semibold text-white">
            −{savings}%
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-lg font-semibold group-hover:text-accent-dark">{item.title}</h3>
        <p className="mt-1 text-xs text-text-muted">{item.subtitle}</p>
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-text-secondary">{item.story}</p>

        <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-text-muted">Под ключ</dt>
            <dd className="mt-1 font-display text-sm font-semibold tabular-nums">
              {formatCaseMoney(item.budget, item.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-text-muted">Срок</dt>
            <dd className="mt-1 font-display text-sm font-semibold tabular-nums">{item.days} дн.</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-text-muted">Выгода</dt>
            <dd className="mt-1 font-display text-sm font-semibold tabular-nums text-accent-dark">
              {formatCaseMoney(saved, item.currency)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-text-muted">{item.result}</p>
      </div>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="card-premium group flex w-[min(100%,20rem)] shrink-0 flex-col overflow-hidden rounded-2xl sm:w-auto"
      >
        {inner}
      </Link>
    );
  }

  return (
    <article className="card-premium flex w-[min(100%,20rem)] shrink-0 flex-col overflow-hidden rounded-2xl sm:w-auto">
      {inner}
    </article>
  );
}
