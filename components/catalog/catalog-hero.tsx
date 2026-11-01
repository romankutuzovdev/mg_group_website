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
  image?: string;
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
  image = "/services/catalog-mercedes.jpg",
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
        background: wash || "#080a09",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-60 motion-safe:animate-hero-ken"
        style={{ backgroundImage: `url('${image}')` }}
        aria-hidden
      />
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
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/20" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" aria-hidden />

      <div
        className={cn(
          "relative mx-auto flex max-w-7xl flex-col justify-end px-4 pb-10 pt-[calc(5rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pb-14 lg:px-8",
          compact ? "min-h-[42svh]" : "min-h-[58svh] sm:min-h-[64svh]",
        )}
      >
        <div className="catalog-crumbs-on-dark [&_a]:text-white/55 [&_a:hover]:text-white [&_nav]:mb-4 [&_span]:text-white/35 [&_.text-foreground]:text-white">
          <CatalogBreadcrumbs items={crumbs} />
        </div>

        <div className="grid items-end gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">
              {brand}<span className="mx-3 text-primary">/</span>Каталог
            </p>
            <h1 className="mt-5 max-w-3xl font-display text-[clamp(2.25rem,5vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-white">
              {title}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
              {description}
            </p>
            {ctas.length > 0 ? (
              <div className="mt-8 flex flex-wrap gap-3">
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
            <div className="hidden justify-end border-l border-white/15 pl-8 lg:flex">{media}</div>
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
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-stone-950 sm:text-3xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500 sm:text-base">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-dark underline-offset-4 transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
