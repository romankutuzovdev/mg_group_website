"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Deal,
  DealStage,
  OriginPoint,
  OriginRegion,
  StageKey,
} from "@/lib/api/cabinet";
import { MAP_STAGE_KEYS, adminUpdateDeal, adminUpdateStage } from "@/lib/api/cabinet";

type Stop = {
  key: StageKey;
  label: string;
  hint: string;
  icon: "yard" | "port" | "sea" | "by" | "home";
  stage: DealStage;
};

function statusWord(status: DealStage["status"]): string {
  if (status === "done") return "Пройдено";
  if (status === "active") return "Сейчас";
  return "Впереди";
}

function buildStops(deal: Deal): Stop[] {
  const byKey = Object.fromEntries(deal.stages.map((s) => [s.key, s])) as Record<
    StageKey,
    DealStage
  >;
  const originLabel = deal.origin_point === "port" ? "Порт" : "Разборка";
  const originHint =
    deal.origin_region === "uk"
      ? deal.origin_point === "port"
        ? "Порт UK"
        : "Площадка UK"
      : deal.origin_point === "port"
        ? "Порт США"
        : "Разборка США";

  const meta: Record<
    StageKey,
    { label: string; hint: string; icon: Stop["icon"] }
  > = {
    selection: { label: "", hint: "", icon: "yard" },
    auction: { label: "", hint: "", icon: "yard" },
    origin: {
      label: originLabel,
      hint: originHint,
      icon: deal.origin_point === "port" ? "port" : "yard",
    },
    ocean: { label: "Море", hint: "Контейнер / атлантика", icon: "sea" },
    belarus: { label: "Беларусь", hint: "Таможня и склад", icon: "by" },
    delivery: { label: "Клиент", hint: "Выдача", icon: "home" },
  };

  return MAP_STAGE_KEYS.map((key) => {
    const stage = byKey[key] || {
      key,
      label: meta[key].label,
      status: "pending" as const,
      note: "",
      updated_at: null,
    };
    return {
      key,
      label: key === "origin" ? originLabel : stage.label || meta[key].label,
      hint: meta[key].hint,
      icon: meta[key].icon,
      stage: {
        ...stage,
        label: key === "origin" ? originLabel : stage.label || meta[key].label,
      },
    };
  });
}

function SectionIcon({ icon, active }: { icon: Stop["icon"]; active: boolean }) {
  const stroke = active ? "#166534" : "#71717a";
  const fill = active ? "#dcfce7" : "#f4f4f5";
  if (icon === "sea") {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <circle cx="20" cy="20" r="18" fill={fill} />
        <path
          d="M8 22c3 0 3-3 6-3s3 3 6 3 3-3 6-3 3 3 6 3"
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M8 27c3 0 3-3 6-3s3 3 6 3 3-3 6-3 3 3 6 3"
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    );
  }
  if (icon === "port") {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <circle cx="20" cy="20" r="18" fill={fill} />
        <path d="M12 28h16" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14 28V16l6-4 6 4v12" fill="none" stroke={stroke} strokeWidth="1.8" />
        <path d="M20 12v16" stroke={stroke} strokeWidth="1.6" />
      </svg>
    );
  }
  if (icon === "by") {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <circle cx="20" cy="20" r="18" fill={fill} />
        <rect
          x="12"
          y="14"
          width="16"
          height="14"
          rx="2"
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
        />
        <path d="M12 20h16M20 14v14" stroke={stroke} strokeWidth="1.4" />
      </svg>
    );
  }
  if (icon === "home") {
    return (
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <circle cx="20" cy="20" r="18" fill={fill} />
        <path
          d="M12 20l8-7 8 7v9H12z"
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // yard / dismantle
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      <circle cx="20" cy="20" r="18" fill={fill} />
      <rect
        x="11"
        y="18"
        width="18"
        height="10"
        rx="1.5"
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
      />
      <path d="M14 18l3-5h6l3 5" fill="none" stroke={stroke} strokeWidth="1.8" />
      <circle cx="15" cy="28" r="2" fill={stroke} />
      <circle cx="25" cy="28" r="2" fill={stroke} />
    </svg>
  );
}

type Props = {
  deal: Deal;
  selectedKey?: StageKey | null;
  onSelectStop?: (key: StageKey) => void;
  /** Manager can change sections inline */
  isAdmin?: boolean;
  onUpdated?: (deal: Deal) => void;
};

export function DealRouteMap({
  deal,
  selectedKey,
  onSelectStop,
  isAdmin = false,
  onUpdated,
}: Props) {
  const stops = useMemo(() => buildStops(deal), [deal]);
  const active =
    stops.find((s) => s.stage.status === "active") ||
    stops.find((s) => s.stage.status === "pending") ||
    stops[0];
  const focusKey = selectedKey || active?.key || null;
  const focus = stops.find((s) => s.key === focusKey) || active;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    setNote(focus?.stage.note || "");
  }, [focus?.key, focus?.stage.note, deal.id]);

  const regionLabel = deal.origin_region === "uk" ? "Англия" : "США";
  const progressDone = stops.filter((s) => s.stage.status === "done").length;
  const progressPct = Math.round((progressDone / Math.max(stops.length, 1)) * 100);

  const run = async (fn: () => Promise<Deal>) => {
    if (!onUpdated) return;
    setBusy(true);
    setError(null);
    try {
      onUpdated(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  const setRoute = (patch: { origin_region?: OriginRegion; origin_point?: OriginPoint }) =>
    void run(() => adminUpdateDeal(deal.id, patch));

  const markSection = (key: StageKey, status: "active" | "done" | "pending") => {
    void run(async () => {
      if (status === "active") {
        const order: StageKey[] = [
          "selection",
          "auction",
          "origin",
          "ocean",
          "belarus",
          "delivery",
        ];
        const idx = order.indexOf(key);
        for (let i = 0; i < idx; i++) {
          const prev = deal.stages.find((s) => s.key === order[i]);
          if (prev && prev.status !== "done") {
            await adminUpdateStage(deal.id, order[i], {
              status: "done",
              note: prev.note,
            });
          }
        }
      }
      const current = deal.stages.find((s) => s.key === key);
      return adminUpdateStage(deal.id, key, {
        status,
        note: (key === focus?.key ? note.trim() : "") || current?.note || "",
      });
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_0_rgba(0,0,0,0.03)]">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-zinc-50 via-white to-emerald-50/70 px-4 py-3.5 sm:px-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 20%, rgba(34,197,94,0.18), transparent 42%), radial-gradient(circle at 88% 10%, rgba(16,185,129,0.12), transparent 40%)",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/80">
              Маршрут доставки
            </p>
            <p className="mt-1 font-display text-lg font-semibold tracking-tight text-zinc-900">
              {regionLabel}
              <span className="mx-2 text-zinc-300">→</span>
              Беларусь
              <span className="mx-2 text-zinc-300">→</span>
              Клиент
            </p>
          </div>
          <div className="min-w-[7.5rem]">
            <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-zinc-500">
              <span>Прогресс</span>
              <span className="tabular-nums text-emerald-700">{progressPct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-[width] duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {isAdmin ? (
          <div className="relative mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-zinc-500">Откуда</span>
              <select
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm"
                value={deal.origin_region || "usa"}
                disabled={busy}
                onChange={(e) =>
                  setRoute({ origin_region: e.target.value as OriginRegion })
                }
              >
                <option value="usa">США</option>
                <option value="uk">Англия</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-zinc-500">Старт маршрута</span>
              <select
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm"
                value={deal.origin_point || "dismantle"}
                disabled={busy}
                onChange={(e) =>
                  setRoute({ origin_point: e.target.value as OriginPoint })
                }
              >
                <option value="dismantle">Разборка</option>
                <option value="port">Порт</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {/* Sections */}
      <div className="px-3 py-4 sm:px-4">
        <div className="relative">
          {/* connector line behind cards */}
          <div
            className="pointer-events-none absolute left-[12%] right-[12%] top-[2.35rem] hidden h-[2px] bg-zinc-200 sm:block"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-[12%] top-[2.35rem] hidden h-[2px] bg-gradient-to-r from-emerald-500 to-emerald-400 transition-[width] duration-500 sm:block"
            style={{
              width: `calc(${(Math.max(progressDone - (active?.stage.status === "active" ? 0 : 0), 0) / Math.max(stops.length - 1, 1)) * 76}% )`,
            }}
            aria-hidden
          />

          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {stops.map((stop, idx) => {
              const isFocus = focus?.key === stop.key;
              const isActive = stop.stage.status === "active";
              const isDone = stop.stage.status === "done";
              return (
                <li key={stop.key}>
                  <button
                    type="button"
                    onClick={() => onSelectStop?.(stop.key)}
                    className={[
                      "group relative flex w-full flex-col items-center rounded-2xl border px-2.5 py-3 text-center transition",
                      isFocus
                        ? "border-emerald-400 bg-emerald-50 shadow-[0_8px_24px_-12px_rgba(22,163,74,0.45)]"
                        : isDone
                          ? "border-emerald-200/80 bg-emerald-50/40 hover:border-emerald-300"
                          : "border-zinc-200 bg-zinc-50/60 hover:border-zinc-300 hover:bg-white",
                      isActive ? "ring-2 ring-emerald-400/40" : "",
                    ].join(" ")}
                  >
                    {isActive ? (
                      <span className="absolute -top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow-sm">
                        Авто здесь
                      </span>
                    ) : null}
                    <SectionIcon icon={stop.icon} active={isDone || isActive || isFocus} />
                    <p className="mt-2 text-sm font-semibold text-zinc-900">{stop.label}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">{stop.hint}</p>
                    <p
                      className={[
                        "mt-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        isDone
                          ? "bg-emerald-100 text-emerald-800"
                          : isActive
                            ? "bg-emerald-600 text-white"
                            : "bg-zinc-200/80 text-zinc-600",
                      ].join(" ")}
                    >
                      {statusWord(stop.stage.status)}
                    </p>
                    <span className="mt-1 text-[10px] tabular-nums text-zinc-400">
                      {idx + 1}/{stops.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Selected section detail + manager controls */}
      {focus ? (
        <div className="border-t border-border bg-zinc-50/80 px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-display text-base font-semibold text-zinc-900">
                {focus.label}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">{focus.hint}</p>
            </div>
            <span
              className={[
                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                focus.stage.status === "done"
                  ? "bg-emerald-100 text-emerald-800"
                  : focus.stage.status === "active"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-200 text-zinc-600",
              ].join(" ")}
            >
              {statusWord(focus.stage.status)}
            </span>
          </div>

          {isAdmin ? (
            <>
              <label className="mt-3 block text-xs">
                <span className="font-medium text-zinc-600">Заметка для клиента</span>
                <textarea
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none ring-emerald-500/30 focus:ring-2"
                  rows={2}
                  value={note}
                  disabled={busy}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Что видит клиент на этом этапе…"
                />
              </label>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => markSection(focus.key, "active")}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Сделать текущей секцией
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => markSection(focus.key, "done")}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Секция пройдена
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => markSection(focus.key, "pending")}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Сбросить
                </button>
              </div>
              {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
              {busy ? <p className="mt-2 text-xs text-zinc-500">Сохраняем…</p> : null}
              <p className="mt-2 text-[11px] text-zinc-400">
                Нажмите секцию выше, затем смените статус — клиент увидит это на карте.
              </p>
            </>
          ) : focus.stage.note ? (
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{focus.stage.note}</p>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">Пока нет заметки по этой секции</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
