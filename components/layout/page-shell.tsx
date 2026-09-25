import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
  title?: string;
  description?: string;
  children?: ReactNode;
  /** Без блока MG.GROUP / заголовка — только контент */
  bare?: boolean;
  className?: string;
};

export function PageShell({
  title,
  description,
  children,
  bare = false,
  className,
}: PageShellProps) {
  return (
    <div className={cn("pt-[calc(3.5rem+env(safe-area-inset-top,0px))]", className)}>
      {!bare && title ? (
        <div className="relative overflow-hidden border-b bg-white">
          <div className="relative mx-auto max-w-7xl px-3 py-3.5 sm:px-4 sm:py-6 lg:px-6">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-primary sm:block">
              MG.GROUP
            </p>
            <h1 className="text-lg font-semibold tracking-tight sm:mt-1.5 sm:text-2xl md:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:mt-2 sm:text-[15px]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-6 lg:px-6">{children}</div>
    </div>
  );
}
