"use client";

import type { Deal, DealStage, StageKey } from "@/lib/api/cabinet";

const ORDER: StageKey[] = [
  "selection",
  "auction",
  "origin",
  "ocean",
  "belarus",
  "delivery",
];

const SHORT: Record<StageKey, string> = {
  selection: "Подбор",
  auction: "Аукцион",
  origin: "Старт",
  ocean: "Море",
  belarus: "РБ",
  delivery: "Клиент",
};

function stageByKey(deal: Deal): Record<string, DealStage> {
  return Object.fromEntries((deal.stages || []).map((s) => [s.key, s]));
}

export function DealClosingStages({
  deal,
  compact = false,
}: {
  deal: Deal;
  compact?: boolean;
}) {
  const byKey = stageByKey(deal);
  const items = ORDER.map((key) => {
    const stage = byKey[key];
    const status = stage?.status || "pending";
    const label =
      key === "origin"
        ? deal.origin_point === "port"
          ? "Порт"
          : "Разборка"
        : stage?.label || SHORT[key];
    return { key, label: compact ? SHORT[key] : label, status };
  });

  return (
    <div className="w-full">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        Этапы закрытия сделки
      </p>
      <ol className="flex flex-wrap gap-1">
        {items.map((item) => {
          const done = item.status === "done";
          const active = item.status === "active";
          return (
            <li
              key={item.key}
              className={[
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                done
                  ? "bg-emerald-100 text-emerald-800"
                  : active
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-500",
              ].join(" ")}
              title={
                done ? "Закрыт" : active ? "Сейчас" : "Впереди"
              }
            >
              <span aria-hidden>{done ? "✓" : active ? "●" : "○"}</span>
              <span className="max-w-[5.5rem] truncate">{item.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
