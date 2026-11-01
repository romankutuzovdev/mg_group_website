import { cn } from "@/lib/utils";

/** Видимый чекбокс согласия: у нативного input Tailwind сбрасывает рамку, и пустая галочка пропадает. */
export function ConsentCheck({
  checked,
  onCheckedChange,
  required,
  children,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 text-left text-xs leading-snug text-zinc-600",
        className,
      )}
    >
      <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          required={required}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-zinc-500 bg-white checked:border-emerald-600 checked:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        />
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}
