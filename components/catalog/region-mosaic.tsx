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
        aria-label="Направления"
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                "group relative shrink-0 overflow-hidden rounded-xl px-4 py-3 transition",
                isActive
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-[#f2f2f2]"
                  : "hover:-translate-y-0.5",
              )}
              style={{ background: visual.wash }}
            >
              <span className="relative z-[1] block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                {visual.code}
              </span>
              <span className="relative z-[1] mt-1 block font-display text-sm font-semibold text-white">
                {visual.shortTitle}
              </span>
              {count > 0 ? (
                <span className="relative z-[1] mt-1 block text-[11px] text-white/55">
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
              "catalog-region-tile group relative flex min-h-[11.5rem] flex-col justify-end overflow-hidden rounded-2xl p-5 text-white sm:min-h-[13.5rem] sm:p-6",
              "transition duration-500 hover:-translate-y-1",
              isActive && "ring-2 ring-primary ring-offset-2 ring-offset-[#f2f2f2]",
            )}
            style={{
              background: visual.wash,
              animationDelay: `${i * 60}ms`,
            }}
          >
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-60 blur-2xl transition duration-500 group-hover:opacity-90 group-hover:scale-110"
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

            <span className="relative z-[1] font-display text-5xl font-bold leading-none tracking-tighter text-white/10 transition group-hover:text-white/20 sm:text-6xl">
              {visual.code}
            </span>

            <div className="relative z-[1] mt-auto pt-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                {visual.sources}
              </p>
              <h3 className="mt-1.5 font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {region.title}
              </h3>
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/60 sm:text-[13px]">
                {visual.tagline}
              </p>
              <div className="mt-4 flex items-center justify-between gap-2">
                {count > 0 ? (
                  <span
                    className="rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
                  >
                    {count.toLocaleString("ru-RU")} авто
                  </span>
                ) : (
                  <span className="text-[11px] text-white/40">Под заказ</span>
                )}
                <span
                  className="text-sm font-semibold transition group-hover:translate-x-0.5"
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
