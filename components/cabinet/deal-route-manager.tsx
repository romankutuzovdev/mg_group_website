"use client";

import { useEffect, useState } from "react";
import type {
  Deal,
  OriginPoint,
  OriginRegion,
  StageKey,
} from "@/lib/api/cabinet";
import { adminUpdateDeal, adminUpdateStage } from "@/lib/api/cabinet";

type Props = {
  deal: Deal;
  focusKey: StageKey | null;
  onUpdated: (deal: Deal) => void;
};

export function DealRouteManager({ deal, focusKey, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const stage =
    deal.stages.find((s) => s.key === focusKey) ||
    deal.stages.find((s) => s.status === "active") ||
    deal.stages[0];

  useEffect(() => {
    setNote(stage?.note || "");
  }, [stage?.key, stage?.note, deal.id]);

  const run = async (fn: () => Promise<Deal>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      onUpdated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  const setRoute = (patch: { origin_region?: OriginRegion; origin_point?: OriginPoint }) =>
    run(() => adminUpdateDeal(deal.id, patch));

  const mark = (status: "active" | "done" | "pending") => {
    if (!stage) return;
    void run(async () => {
      // When activating a map stage, mark earlier map stages done
      if (status === "active") {
        const order: StageKey[] = [
          "selection",
          "auction",
          "origin",
          "ocean",
          "belarus",
          "delivery",
        ];
        const idx = order.indexOf(stage.key);
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
      return adminUpdateStage(deal.id, stage.key, {
        status,
        note: note.trim() || stage.note,
      });
    });
  };

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800/80">
        Менеджер — маршрут
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        Клиент видит карту. Здесь вы двигаете авто по этапам.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-text-muted">Откуда</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm"
            value={deal.origin_region || "usa"}
            disabled={busy}
            onChange={(e) =>
              void setRoute({ origin_region: e.target.value as OriginRegion })
            }
          >
            <option value="usa">США</option>
            <option value="uk">Англия</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-text-muted">Старт</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm"
            value={deal.origin_point || "dismantle"}
            disabled={busy}
            onChange={(e) =>
              void setRoute({ origin_point: e.target.value as OriginPoint })
            }
          >
            <option value="dismantle">Разборка</option>
            <option value="port">Порт</option>
          </select>
        </label>
      </div>

      {stage ? (
        <div className="mt-3 rounded-lg border border-border bg-white p-2.5">
          <p className="text-sm font-semibold">
            Этап: {stage.label}
            <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              {stage.status}
            </span>
          </p>
          <label className="mt-2 block text-xs">
            <span className="text-text-muted">Заметка для клиента</span>
            <textarea
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
              rows={2}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Например: контейнер вышел из NY…"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => mark("active")}
              className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              Сделать текущим
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => mark("done")}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Отметить готово
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => mark("pending")}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Сбросить
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {busy ? <p className="mt-2 text-xs text-text-muted">Сохраняем…</p> : null}
    </div>
  );
}
