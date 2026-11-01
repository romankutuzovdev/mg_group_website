import Link from "next/link";
import {
  REGION_ORDER,
  REGIONS,
  catalogPath,
  type CatalogRegionSlug,
} from "@/lib/catalog";
import { REGION_VISUAL } from "@/lib/catalog/region-visual";
import { cn } from "@/lib/utils";

type Props = {
  lotCounts?: Partial<Record<CatalogRegionSlug, number>>;
  active?: CatalogRegionSlug;
  /** Compact strip for region/make pages */
  variant?: "mosaic" | "strip";
};

export function RegionMosaic({ lotCounts = {}, active, variant = "mosaic" }: Props) {
  if (variant === "strip") {
    return (
      <nav
        aria-label="Каталоги по странам"
        className="flex gap-1 overflow-x-auto border-b border-stone-200 pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {REGION_ORDER.map((slug) => {
          const region = REGIONS[slug];
          const visual = REGION_VISUAL[slug];
          const isActive = active === slug;
          const count = lotCounts[slug] || 0;
          return (
            <Link
              key={slug}
              href={catalogPath(slug)}
              className={cn(
                "group relative min-h-16 shrink-0 border-b-2 px-4 py-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-6",
                isActive
                  ? "border-accent-dark text-stone-950"
                  : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-950",
              )}
            >
              <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                {visual.code}
              </span>
              <span className="mt-0.5 block font-display text-sm font-semibold">
                {visual.shortTitle}
              </span>
              {count > 0 ? (
                <span className="mt-0.5 block text-[10px] tabular-nums text-stone-400">
                  {count.toLocaleString("ru-RU")} лотов
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {REGION_ORDER.map((slug, i) => {
        const region = REGIONS[slug];
        const visual = REGION_VISUAL[slug];
        const count = lotCounts[slug] || 0;
        const isActive = active === slug;

        return (
          <Link
            key={slug}
            href={catalogPath(slug)}
            className={cn(
              "catalog-region-tile group relative flex min-h-[20rem] flex-col justify-end overflow-hidden rounded-2xl p-5 text-white sm:min-h-[23rem] sm:p-6",
              "ring-1 ring-inset ring-white/10 transition duration-500 hover:ring-white/30",
              isActive && "ring-2 ring-accent ring-offset-2 ring-offset-[#fafaf9]",
            )}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div
              className="absolute inset-0 bg-cover bg-center opacity-80 transition duration-700 group-hover:scale-[1.035] group-hover:opacity-95"
              style={{ backgroundImage: `url('${visual.image}')` }}
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" aria-hidden />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/45 to-transparent" aria-hidden />
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-30 blur-2xl transition duration-500 group-hover:opacity-60"
              style={{ background: visual.glow }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100"
              style={{
                background: `radial-gradient(ellipse at 70% 20%, ${visual.glow}, transparent 55%)`,
              }}
              aria-hidden
            />

            <span className="relative z-[1] font-mono text-[10px] font-medium uppercase tracking-[0.28em] text-white/50">
              {visual.code}
            </span>

            <div className="relative z-[1] mt-auto pt-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                {visual.sources}
              </p>
              <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                {region.title}
              </h3>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/65">
                {visual.tagline}
              </p>
              <div className="mt-4 flex items-center justify-between gap-2">
                {count > 0 ? (
                  <span className="border-t border-white/25 pt-2 text-[11px] font-semibold tabular-nums text-white/75">
                    {count.toLocaleString("ru-RU")} авто
                  </span>
                ) : (
                  <span className="text-[11px] text-white/40">Под заказ</span>
                )}
                <span
                  className="text-xs font-semibold uppercase tracking-[0.16em] transition group-hover:translate-x-0.5"
                  style={{ color: visual.accent }}
                >
                  Открыть →
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
