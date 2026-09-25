import Link from "next/link";
import type { CatalogMake, CatalogModel } from "@/lib/catalog";
import { catalogPath } from "@/lib/catalog";
import { cn } from "@/lib/utils";

function lotLabel(n: number) {
  if (n === 1) return "1 лот";
  if (n > 1 && n < 5) return `${n} лота`;
  return `${n} лотов`;
}

export function MakeCard({
  regionSlug,
  make,
  href,
  lotCount,
}: {
  regionSlug: string;
  make: CatalogMake;
  href?: string;
  lotCount?: number;
}) {
  const hasLots = typeof lotCount === "number" && lotCount > 0;

  return (
    <Link
      href={href ?? catalogPath(regionSlug, make.slug)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl",
        "border border-zinc-200/70 bg-white",
        "transition duration-300 ease-out",
        "hover:-translate-y-1 hover:border-primary/40",
        "hover:shadow-[0_20px_40px_-24px_rgba(13,63,16,0.45)]",
      )}
    >
      <div className="relative flex aspect-[5/4] items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f8faf8_0%,#ffffff_55%,#f3f6f3_100%)] p-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(ellipse at 50% 35%, rgba(34,197,94,0.16), transparent 62%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent"
          aria-hidden
        />
        {make.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={make.logo}
            alt={make.name}
            className="relative z-[1] max-h-[4.5rem] max-w-[6rem] object-contain transition duration-500 group-hover:scale-110 sm:max-h-[5rem] sm:max-w-[7rem]"
            loading="lazy"
          />
        ) : (
          <span className="relative z-[1] font-display text-3xl font-bold tracking-tight text-primary/40">
            {make.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        {hasLots ? (
          <span className="absolute right-2.5 top-2.5 rounded-lg bg-[#0D3F10] px-2 py-1 text-[10px] font-bold tabular-nums tracking-wide text-white shadow-sm">
            {lotCount}
          </span>
        ) : null}
      </div>
      <div className="border-t border-zinc-100 px-3 py-3.5 text-center">
        <p className="truncate font-display text-sm font-semibold text-zinc-900 transition group-hover:text-primary">
          {make.name}
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {hasLots
            ? lotLabel(lotCount!)
            : `${make.models.length} модел${make.models.length === 1 ? "ь" : make.models.length < 5 ? "и" : "ей"}`}
        </p>
      </div>
    </Link>
  );
}

export function ModelCard({
  regionSlug,
  makeSlug,
  makeName,
  model,
  lotCount,
}: {
  regionSlug: string;
  makeSlug: string;
  makeName: string;
  model: CatalogModel;
  lotCount?: number;
}) {
  const hasLots = typeof lotCount === "number" && lotCount > 0;

  return (
    <Link
      href={catalogPath(regionSlug, makeSlug, model.slug)}
      className={cn(
        "group overflow-hidden rounded-2xl border border-zinc-200/70 bg-white",
        "transition duration-300 ease-out",
        "hover:-translate-y-1 hover:border-primary/40",
        "hover:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.35)]",
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-100">
        {model.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={model.image}
            alt={`${makeName} ${model.name}`}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.06]"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#e8eee9,#dfe6e1)]">
            <span className="font-display text-5xl font-bold text-primary/20">
              {makeName.slice(0, 1)}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
        {hasLots ? (
          <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-semibold text-zinc-900 shadow-sm backdrop-blur-sm">
            {lotLabel(lotCount!)}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
            {makeName}
          </p>
          <h3 className="mt-0.5 font-display text-lg font-semibold text-white drop-shadow-sm">
            {model.name}
          </h3>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <span className="text-sm text-zinc-500">Ставка и просчёт</span>
        <span className="text-sm font-semibold text-primary transition group-hover:translate-x-0.5">
          Смотреть →
        </span>
      </div>
    </Link>
  );
}

/** @deprecated Prefer RegionMosaic — kept for city SEO pages */
export function RegionCard({
  href,
  title,
  description,
  lotCount,
  accent,
}: {
  href: string;
  title: string;
  description: string;
  lotCount?: number;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-6 sm:p-7",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition duration-300",
        "hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_16px_36px_-18px_rgba(22,163,74,0.4)]",
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-40 blur-2xl transition group-hover:opacity-70"
        style={{ background: accent || "rgba(34,197,94,0.35)" }}
      />
      <h2 className="relative font-display text-xl font-semibold tracking-tight text-zinc-900 group-hover:text-primary sm:text-2xl">
        {title}
      </h2>
      <p className="relative mt-2 max-w-md text-sm leading-relaxed text-zinc-500">{description}</p>
      <div className="relative mt-5 flex items-center justify-between gap-3">
        {typeof lotCount === "number" && lotCount > 0 ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-[#0D3F10]">
            {lotCount.toLocaleString("ru-RU")} авто
          </span>
        ) : (
          <span className="text-xs font-medium text-zinc-400">Скоро лоты</span>
        )}
        <span className="text-sm font-semibold text-primary">Открыть →</span>
      </div>
    </Link>
  );
}
