"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LotImage } from "@/components/auctions/lot-image";
import { LinkButton } from "@/components/site/button";
import { fetchShowcase, type ShowcaseKind, type ShowcasePick } from "@/lib/api/cabinet";
import { isApiEnabled } from "@/lib/api/config";
import { displayDamage } from "@/lib/auctions/listing-blob";
import {
  collectLotPhotoUrls,
  LOT_IMAGE_FALLBACK,
  resolveLotImageUrl,
} from "@/lib/auctions/lot-image-url";

const REGION_LABELS: Record<string, string> = {
  usa: "США",
  uk: "Англия",
  china: "Китай",
  korea: "Корея",
};

export const KIND_LABELS: Record<ShowcaseKind, string> = {
  restoration: "Под восстановление",
  kit: "Машинокомплект",
};

export function regionLabel(region: string) {
  return REGION_LABELS[region] || region.toUpperCase();
}

export function money(amount: number | null | undefined, currency: "USD" | "GBP" = "USD") {
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

export function useShowcase(section: "home" | "bought", kind: "" | ShowcaseKind, limit: number) {
  const [items, setItems] = useState<ShowcasePick[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!isApiEnabled()) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    fetchShowcase(section, kind, limit)
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        /* блок просто не покажется */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [section, kind, limit]);
  return { items, loaded };
}

export function pickHref(pick: ShowcasePick) {
  return `/podborka/?id=${pick.id}`;
}

/** Карточка в стиле каталога (LotCard): фото, ставка на фото, итог под ключ зелёной плашкой. */
export function PickCard({ pick, bought }: { pick: ShowcasePick; bought?: boolean }) {
  const title = [pick.make, pick.model].filter(Boolean).join(" ") || pick.title || "Авто";
  const damage = displayDamage(pick.damage);
  const photos = collectLotPhotoUrls({ imageUrl: pick.image_url, imageUrls: pick.images });
  const cover = photos[0] ? resolveLotImageUrl(photos[0], pick.make) : LOT_IMAGE_FALLBACK;
  const when = bought ? monthYear(pick.bought_at) : "";
  const specs = [pick.odometer || null, damage || null, pick.specs?.["Ключ"] ? "Есть ключ" : null].filter(
    Boolean,
  ) as string[];

  return (
    <Link href={pickHref(pick)} className="group block h-full min-w-0" prefetch={false}>
      <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-zinc-100">
          <LotImage
            src={cover}
            alt={`${pick.year ?? ""} ${title}`.trim()}
            fill
            tone="dark"
            loading="lazy"
            decoding="async"
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
            sizes="(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-800 shadow-sm backdrop-blur-sm">
              {regionLabel(pick.region)}
            </span>
            {photos.length > 1 ? (
              <span className="rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                {photos.length} фото
              </span>
            ) : null}
            {bought ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#22c55e] px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-sm ring-2 ring-white/40">
                <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                Купили
              </span>
            ) : null}
          </div>

          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-2.5 sm:gap-3 sm:p-3">
            <div className="max-w-full shrink-0 rounded-xl bg-[#0D3F10]/92 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/10 backdrop-blur-md sm:px-3.5 sm:py-2.5">
              <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/90">
                {bought ? "Ставка на аукционе" : "Ставка"}
              </p>
              <p className="whitespace-nowrap font-display text-xl font-bold tabular-nums tracking-tight text-white sm:text-2xl">
                {money(pick.bid, pick.currency)}
              </p>
            </div>
            {when ? (
              <span className="ml-auto shrink-0 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm sm:text-[11px]">
                {when}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col px-3.5 pb-3.5 pt-3.5 sm:px-4 sm:pb-4 sm:pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
              {[pick.year, KIND_LABELS[pick.kind]].filter(Boolean).join(" · ")}
            </p>
            <h3 className="mt-0.5 line-clamp-2 font-display text-[15px] font-semibold leading-snug tracking-tight text-zinc-900 transition group-hover:text-accent-dark sm:text-base">
              {title}
            </h3>
          </div>

          {pick.source ? <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{pick.source}</p> : null}

          {specs.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 border-t border-zinc-100 pt-3 text-[11px] text-zinc-600 sm:text-xs">
              {specs.map((item, i) => (
                <span key={`${item}-${i}`} className="inline-flex items-center gap-2">
                  {i > 0 ? <span className="text-zinc-300" aria-hidden>•</span> : null}
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-[#22c55e]/15 to-[#22c55e]/5 px-3 py-2.5 ring-1 ring-inset ring-[#22c55e]/30">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0D3F10]">
                  {bought ? "Обошлось под ключ" : "Под ключ"}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  {pick.kind === "kit" ? "лот + аукцион + доставка + разбор" : pick.summary || "ставка + сборы + доставка"}
                </p>
              </div>
              <p className="shrink-0 font-display text-lg font-bold tabular-nums tracking-tight text-[#0D3F10] sm:text-xl">
                {money(pick.total_usd)}
              </p>
            </div>
          </div>
        </div>
      </article>
    </Link>
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

export function CardRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

/** «Выбор менеджеров»: лоты, которые менеджер отправил на главную из калькулятора. */
export function ManagerPicksSection({ kind }: { kind: ShowcaseKind }) {
  const { items } = useShowcase("home", kind, 9);
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
  const { items } = useShowcase("bought", "", 24);
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
