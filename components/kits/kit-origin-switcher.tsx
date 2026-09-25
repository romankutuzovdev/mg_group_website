import Link from "next/link";
import { cn } from "@/lib/utils";
import { kitOriginPath } from "@/lib/seo/cities";

type Origin = "usa" | "uk";

const OPTIONS: { id: Origin; label: string }[] = [
  { id: "usa", label: "Из США" },
  { id: "uk", label: "Из Англии" },
];

type Props = {
  origin: Origin;
  /** Якорь после смены направления, напр. #calculator */
  hash?: string;
  className?: string;
};

export function KitOriginSwitcher({ origin, hash = "", className }: Props) {
  return (
    <div
      className={cn(
        "inline-flex gap-1 rounded-lg border border-border bg-bg-base p-1",
        className,
      )}
      role="tablist"
      aria-label="Направление комплектов"
    >
      {OPTIONS.map((item) => {
        const active = item.id === origin;
        const href = `${kitOriginPath(item.id)}${hash}`;
        return (
          <Link
            key={item.id}
            href={href}
            role="tab"
            aria-selected={active}
            className={cn(
              "min-h-10 min-w-[7.5rem] rounded-md px-4 py-2 text-center text-sm font-medium transition",
              active
                ? "bg-accent-dark text-white"
                : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
