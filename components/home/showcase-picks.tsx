"use client";

import { useEffect, useMemo, useState } from "react";
import { LinkButton } from "@/components/site/button";
import { fetchShowcase, type ShowcaseKind, type ShowcasePick } from "@/lib/api/cabinet";
import { isApiEnabled } from "@/lib/api/config";
import { displayDamage } from "@/lib/auctions/listing-blob";
import { resolveLotImageUrl } from "@/lib/auctions/lot-image-url";

const REGION_LABELS: Record<string, string> = {
  usa: "США",
  uk: "Англия",
  china: "Китай",
  korea: "Корея",
};

const KIND_LABELS: Record<ShowcaseKind, string> = {
  restoration: "Под восстановление",
  kit: "Машинокомплект",
};

function regionLabel(region: string) {
  return REGION_LABELS[region] || region.toUpperCase();
}

function money(amount: number | null | undefined, currency: "USD" | "GBP" = "USD") {
  if (amount == null || !(amount > 0)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function monthYear(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

function pickTitle(pick: ShowcasePick) {
  return [pick.year, pick.make, pick.model].filter(Boolean).join(" ") || pick.title || "Авто";
}

function useShowcase(section: "home" | "bought", kind: "" | ShowcaseKind, limit: number) {
  const [items, setItems] = useState<ShowcasePick[]>([]);
  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    fetchShowcase(section, kind, limit)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        /* блок просто не покажется */
      });
    return () => {
      cancelled = true;
    };
  }, [section, kind, limit]);
  return items;
}

function PickCard({ pick, bought }: { pick: ShowcasePick; bought?: boolean }) {
  const title = pickTitle(pick);
  const damage = displayDamage(pick.damage);
  const image = pick.image_url ? resolveLotImageUrl(pick.image_url, pick.make) : "";
  const when = bought ? monthYear(pick.bought_at) : "";

  return (
    <article className="card-premium flex w-[min(85vw,20rem)] shrink-0 snap-start flex-col overflow-hidden rounded-2xl sm:w-auto">
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-100">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">Нет фото</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
            {regionLabel(pick.region)}
            {pick.source ? ` · ${pick.source}` : ""}
          </span>
          {bought ? (
            <span className="rounded-full bg-[#22c55e] px-2.5 py-1 text-[10px] font-semibold text-white">
              Купили
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold leading-snug">{title}</h3>
          {when ? <span className="shrink-0 pt-1 text-xs text-text-muted">{when}</span> : null}
        </div>
        <p className="mt-1 text-xs text-text-muted">{KIND_LABELS[pick.kind]}</p>
        {damage || pick.odometer ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {damage ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">{damage}</span>
            ) : null}
            {pick.odometer ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-text-secondary">
                {pick.odometer}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-5 flex-1" />
        <dl className="grid grid-cols-2 gap-2 border-t border-border pt-4">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-text-muted">Ставка</dt>
            <dd className="mt-1 font-display text-sm font-semibold tabular-nums">
              {money(pick.bid, pick.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-text-muted">
              {bought ? "Обошлось под ключ" : "Под ключ"}
            </dt>
            <dd className="mt-1 font-display text-base font-semibold tabular-nums text-accent-dark">
              {money(pick.total_usd)}
            </dd>
          </div>
        </dl>
        {pick.summary ? <p className="mt-2 text-[11px] text-text-muted">{pick.summary}</p> : null}
      </div>
    </article>
  );
}

function Shell({
  id,
  kicker,
  title,
  description,
  children,
  actions,
  muted,
}: {
  id: string;
  kicker: string;
  title: string;
  description: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 border-t border-border py-14 md:py-20 ${muted ? "bg-bg-elevated" : "bg-bg-base"}`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="lux-kicker">{kicker}</p>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-sm text-text-secondary sm:text-base">{description}</p>
        </div>
        {children}
        {actions ? <div className="mt-10 flex flex-wrap justify-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}

function CardRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 mt-10 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

/** «Выбор менеджеров»: лоты, которые менеджер отправил на главную из калькулятора. */
export function ManagerPicksSection({ kind }: { kind: ShowcaseKind }) {
  const items = useShowcase("home", kind, 9);
  if (!items.length) return null;

  const isKit = kind === "kit";
  return (
    <Shell
      id={isKit ? "picks-kits" : "picks-restoration"}
      kicker="Выбор менеджеров"
      title={isKit ? "Наши машинокомплекты" : "Авто под восстановление под ключ"}
      description={
        isKit
          ? "Доноры, которые менеджеры посчитали и отобрали: ставка на аукционе и итог с доставкой и разбором."
          : "Хорошие варианты, которые менеджеры посчитали в калькуляторе: ставка и итог под ключ до Минска."
      }
      muted={isKit}
      actions={
        <LinkButton href={isKit ? "/mashinokomplekt/" : "/avto/"} variant="secondary">
          {isKit ? "Все машинокомплекты" : "Каталог авто"}
        </LinkButton>
      }
    >
      <CardRow>
        {items.map((pick) => (
          <PickCard key={pick.id} pick={pick} />
        ))}
      </CardRow>
    </Shell>
  );
}

/** «Купленные авто»: что уже привезли и за сколько, с фильтром по стране. */
export function BoughtCarsSection() {
  const items = useShowcase("bought", "", 24);
  const [region, setRegion] = useState("all");

  const regions = useMemo(() => {
    const seen = new Set<string>();
    items.forEach((pick) => seen.add(pick.region));
    return Array.from(seen);
  }, [items]);

  if (!items.length) return null;
  const visible = region === "all" ? items : items.filter((pick) => pick.region === region);

  return (
    <Shell
      id="bought"
      kicker="Купленные авто"
      title="Что мы уже привезли и за сколько"
      description="Реальные лоты, которые купили для клиентов: ставка на аукционе и сколько машина обошлась под ключ."
    >
      {regions.length > 1 ? (
        <div className="mt-8 flex flex-wrap gap-2">
          {["all", ...regions].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRegion(key)}
              className={`min-h-10 rounded-full border px-4 py-1.5 text-sm transition ${
                region === key
                  ? "border-accent-dark bg-accent-dark text-white"
                  : "border-border bg-bg-elevated text-text-secondary hover:border-accent/40"
              }`}
            >
              {key === "all" ? "Все" : regionLabel(key)}
            </button>
          ))}
        </div>
      ) : null}
      <CardRow>
        {visible.map((pick) => (
          <PickCard key={pick.id} pick={pick} bought />
        ))}
      </CardRow>
    </Shell>
  );
}
