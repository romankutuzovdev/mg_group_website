"use client";

import type { Deal, DealStage, StageKey } from "@/lib/api/cabinet";
import { dealKind, stageKeysForDeal } from "@/lib/api/cabinet";

const SHORT: Record<StageKey, string> = {
  selection: "Подбор",
  auction: "Аукцион",
  origin: "Старт",
  ocean: "Море",
  belarus: "РБ",
  delivery: "Клиент",
};

const KIT_LABEL: Partial<Record<StageKey, string>> = {
  auction: "Аукцион",
  origin: "Разборка",
  belarus: "Дорога до Беларуси",
};

const KIT_SHORT: Partial<Record<StageKey, string>> = {
  auction: "Аукцион",
  origin: "Разборка",
  belarus: "До Беларуси",
};

function stageByKey(deal: Deal): Record<string, DealStage> {
  return Object.fromEntries((deal.stages || []).map((s) => [s.key, s]));
}

export function DealClosingStages({
  deal,
  compact = false,
  bare = false,
}: {
  deal: Deal;
  compact?: boolean;
  /** Без заголовка — когда компонент уже внутри карточки с названием. */
  bare?: boolean;
}) {
  const byKey = stageByKey(deal);
  const kit = dealKind(deal) === "kit";
  const items = stageKeysForDeal(deal).map((key) => {
    const stage = byKey[key];
    const status = stage?.status || "pending";
    const label = kit
      ? (compact ? KIT_SHORT[key] : KIT_LABEL[key]) || SHORT[key]
      : key === "origin"
        ? deal.origin_point === "port"
          ? "Порт"
          : "Разборка"
        : stage?.label || SHORT[key];
    return { key, label: compact && !kit ? SHORT[key] : label, status };
  });

  return (
    <div className="w-full">
      {!bare ? (
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Этапы закрытия сделки
        </p>
      ) : null}
      <ol className={bare ? "space-y-1.5" : "flex flex-wrap gap-1"}>
        {items.map((item) => {
          const done = item.status === "done";
          const active = item.status === "active";
          if (bare) {
            return (
              <li key={item.key} className="flex items-center gap-2.5 text-[13px]">
                <span
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                    done
                      ? "bg-emerald-600 text-white"
                      : active
                        ? "bg-white text-emerald-600 ring-2 ring-emerald-600"
                        : "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200",
                  ].join(" ")}
                  aria-hidden
                >
                  {done ? "✓" : active ? "●" : ""}
                </span>
                <span className={done ? "text-zinc-500" : active ? "font-medium text-zinc-900" : "text-zinc-400"}>
                  {item.label}
                </span>
                {active ? (
                  <span className="ml-auto text-[11px] font-medium text-emerald-700">сейчас</span>
                ) : null}
              </li>
            );
          }
          return (
            <li
              key={item.key}
              className={[
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                done
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : active
                    ? "bg-emerald-600 text-white ring-emerald-600"
                    : "bg-zinc-50 text-zinc-500 ring-zinc-200",
              ].join(" ")}
              title={done ? "Закрыт" : active ? "Сейчас" : "Впереди"}
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
