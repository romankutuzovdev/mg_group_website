"use client";

/**
 * Cabinet design system — the small set of primitives every cabinet screen
 * is built from. Neutral surfaces, 1px borders, one accent (brand green),
 * tight typography, no decorative gradients. Keep it boring on purpose.
 */

import Link from "next/link";
import { type ComponentProps, type ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark";
export type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
  dark: "bg-zinc-900 text-white shadow-sm hover:bg-zinc-800",
  secondary:
    "border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:border-zinc-300 hover:bg-zinc-50",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  danger: "border border-rose-200 bg-white text-rose-700 shadow-sm hover:bg-rose-50",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3.5 text-[13px]",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />
  );
});

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export const inputClass =
  "h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-zinc-50";

export const textareaClass =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

export const labelClass = "block text-xs font-medium text-zinc-600";

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  as: Tag = "section",
}: {
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article" | "form";
}) {
  return (
    <Tag className={cn("rounded-lg border border-zinc-200 bg-white shadow-sm", className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 sm:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-4 sm:p-5", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1 text-xs text-zinc-500">{breadcrumb}</div> : null}
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] text-zinc-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-zinc-200 bg-white px-4 py-3.5 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        {icon ? <span className="text-zinc-400">{icon}</span> : null}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", className)}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type Tone = "neutral" | "success" | "info" | "warning" | "danger" | "brand";

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  brand: "bg-emerald-600 text-white ring-emerald-600",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-zinc-400",
  success: "bg-emerald-500",
  info: "bg-sky-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  brand: "bg-white",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        TONE_CHIP[tone],
        className,
      )}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} /> : null}
      {children}
    </span>
  );
}

export function dealStatusTone(status: string | undefined | null): Tone {
  if (status === "completed") return "success";
  if (status === "cancelled") return "neutral";
  return "info";
}

export function dealStatusLabel(status: string | undefined | null): string {
  if (status === "completed") return "Завершена";
  if (status === "cancelled") return "Отменена";
  return "В работе";
}

export function Progress({
  value,
  className,
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "neutral";
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-100", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all",
          tone === "brand" ? "bg-emerald-500" : "bg-zinc-400",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-400 ring-1 ring-zinc-200">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "neutral",
  className,
  children,
  action,
}: {
  tone?: "neutral" | "success" | "danger" | "warning" | "info";
  className?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const styles = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  }[tone];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3.5 py-2.5 text-[13px]",
        styles,
        className,
      )}
      role={tone === "danger" ? "alert" : undefined}
    >
      <span className="min-w-0">{children}</span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600",
        className,
      )}
      aria-hidden
    />
  );
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-11 w-11 text-sm" }[size];
  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-zinc-200", dims, className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-zinc-900 font-semibold text-white",
        dims,
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tables / lists
// ---------------------------------------------------------------------------

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}

export function Th({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <th
      className={cn(
        "border-b border-zinc-200 bg-zinc-50/80 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500 first:pl-5 last:pr-5",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <td
      className={cn(
        "border-b border-zinc-100 px-4 py-3 align-middle text-zinc-700 first:pl-5 last:pr-5",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function KeyValue({
  rows,
  className,
}: {
  rows: { label: ReactNode; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-zinc-100", className)}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2 text-[13px]">
          <dt className="shrink-0 text-zinc-500">{row.label}</dt>
          <dd className="min-w-0 text-right font-medium text-zinc-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-medium uppercase tracking-wide text-zinc-500", className)}>
      {children}
    </p>
  );
}
