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
  { key: "secondary_damage", label: "Вторичное повреждение" },
  { key: "loss_type", label: "Тип потери" },
  { key: "start_code", label: "Состояние запуска" },
  { key: "key_info", label: "Ключи" },
  { key: "sale_document", label: "Документ" },
  { key: "seller", label: "Продавец" },
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
        "overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="border-b border-zinc-100 px-4 py-3">
        <p className="text-sm font-semibold text-zinc-900">Характеристики лота</p>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-zinc-100">
        {rows.map((row) => (
          <div key={row.label} className="bg-white px-4 py-2.5">
            <dt className="text-[11px] font-medium text-zinc-500">{row.label}</dt>
            <dd className="mt-0.5 truncate text-[13px] font-medium text-zinc-900" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
