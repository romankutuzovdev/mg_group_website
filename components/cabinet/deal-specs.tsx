"use client";

import type { DealSpecs } from "@/lib/api/cabinet";

const SPEC_LABELS: { key: keyof DealSpecs; label: string }[] = [
  { key: "location", label: "Площадка" },
  { key: "odometer", label: "Пробег" },
  { key: "category", label: "Категория" },
  { key: "body_style", label: "Кузов" },
  { key: "engine", label: "Двигатель" },
  { key: "cylinders", label: "Цилиндры" },
  { key: "fuel", label: "Топливо" },
  { key: "transmission", label: "КПП" },
  { key: "drive", label: "Привод" },
  { key: "exterior_color", label: "Цвет" },
  { key: "primary_damage", label: "Повреждение" },
];

export function dealSpecsRows(specs?: DealSpecs | null): { label: string; value: string }[] {
  if (!specs) return [];
  return SPEC_LABELS.map(({ key, label }) => {
    const value = String(specs[key] || "").trim();
    return value ? { label, value } : null;
  }).filter((row): row is { label: string; value: string } => Boolean(row));
}

export function DealSpecsGrid({
  specs,
  className = "",
}: {
  specs?: DealSpecs | null;
  className?: string;
}) {
  const rows = dealSpecsRows(specs);
  if (!rows.length) return null;
  return (
    <div
      className={[
        "overflow-hidden rounded-xl border border-zinc-200/80 bg-white",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="border-b border-zinc-100 px-3 py-2">
        <p className="text-xs font-semibold text-zinc-800">Характеристики лота</p>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-zinc-100 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="bg-white px-3 py-2">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              {row.label}
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-zinc-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
