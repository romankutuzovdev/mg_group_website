import { type ReactNode } from "react";
import Link from "next/link";
import { CatalogBreadcrumbs } from "@/components/catalog/breadcrumbs";
import { LinkButton } from "@/components/site/button";
import { cn } from "@/lib/utils";

type Crumb = { href?: string; label: string };

type Cta = {
  href: string;
  label: string;
  variant?: "primary" | "secondary" | "outline";
};

type Props = {
  brand?: string;
  title: string;
  description: string;
  crumbs: Crumb[];
  ctas?: Cta[];
  /** CSS background (gradient) */
  wash?: string;
  glow?: string;
  /** Optional right-side visual (logo, code badge) */
  media?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function CatalogHero({
  brand = "MG.GROUP",
  title,
  description,
  crumbs,
  ctas = [],
  wash,
  glow,
  media,
  compact = false,
  className,
}: Props) {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-b border-white/5",
        compact ? "min-h-[42svh]" : "min-h-[58svh] sm:min-h-[64svh]",
        className,
      )}
      style={{
        background:
          wash ||
          "linear-gradient(145deg, #041008 0%, #0a1f12 38%, #0d2818 62%, #06140c 100%)",
      }}
    >
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{ background: glow || "rgba(34,197,94,0.28)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full blur-3xl opacity-50"
        style={{ background: glow || "rgba(34,197,94,0.18)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[url('/hero-mercedes-night.png')] bg-cover bg-[position:70%_45%] opacity-[0.18] mix-blend-luminosity"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/25" aria-hidden />

      <div
        className={cn(
          "relative mx-auto flex max-w-7xl flex-col justify-end px-3 pb-8 pt-[calc(4.25rem+env(safe-area-inset-top,0px))] sm:px-4 sm:pb-12 lg:px-6",
          compact ? "min-h-[42svh]" : "min-h-[58svh] sm:min-h-[64svh]",
        )}
      >
        <div className="catalog-crumbs-on-dark [&_a]:text-white/55 [&_a:hover]:text-white [&_nav]:mb-4 [&_span]:text-white/35 [&_.text-foreground]:text-white">
          <CatalogBreadcrumbs items={crumbs} />
        </div>

        <div className="grid items-end gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="min-w-0">
            <p className="lux-kicker text-white/90">{brand}</p>
            <h1 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl md:text-5xl lg:text-[3.25rem]">
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              {description}
            </p>
            {ctas.length > 0 ? (
              <div className="mt-7 flex flex-wrap gap-3">
                {ctas.map((cta, i) => (
                  <LinkButton
                    key={`${i}-${cta.href}-${cta.label}`}
                    href={cta.href}
                    variant={cta.variant ?? "primary"}
                  >
                    {cta.label}
                  </LinkButton>
                ))}
              </div>
            ) : null}
          </div>

          {media ? (
            <div className="hidden justify-end lg:flex">{media}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function CatalogSection({
  id,
  title,
  subtitle,
  action,
  children,
  className,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24", className)}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="text-sm font-semibold text-primary transition hover:text-[#0D3F10]"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
