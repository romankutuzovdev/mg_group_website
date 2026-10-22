import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
  title?: string;
  description?: string;
  children?: ReactNode;
  /** Без блока MG.GROUP / заголовка — только контент */
  bare?: boolean;
  /** На всю ширину и высоту экрана, без отступа под фиксированную шапку */
  full?: boolean;
  className?: string;
};

export function PageShell({
  title,
  description,
  children,
  bare = false,
  full = false,
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        full
          ? "flex min-h-[100dvh] w-full flex-1 flex-col bg-[#f2f2f2]"
          : "pt-[calc(3.5rem+env(safe-area-inset-top,0px))]",
      )}
    >
      {!bare && title ? (
        <div className="relative overflow-hidden border-b border-stone-200/80 bg-stone-950 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_240px_at_10%_0%,rgba(34,197,94,0.22),transparent_55%)]" />
          <div className="relative mx-auto max-w-7xl px-3 pb-4 pt-3 sm:px-4 sm:pb-5 sm:pt-4 lg:px-6">
            <p className="inline-flex rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              MG.GROUP
            </p>
            <h1 className="mt-2.5 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          full
            ? "flex w-full flex-1 flex-col px-3 py-3 sm:px-5 sm:py-5 lg:px-8"
            : "mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-6 lg:px-6",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
