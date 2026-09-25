"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deal, DismantleCell, DismantleMap } from "@/lib/api/cabinet";
import {
  downloadDismantleMapXlsx,
  fetchDismantleMap,
  patchDismantleCell,
  patchDismantleMeta,
} from "@/lib/api/cabinet";

type Field = "qty" | "packing" | "note";
type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  deal: Deal;
};

function CellInput({
  value,
  onCommit,
  placeholder,
  className,
  inputMode,
  readOnly,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  readOnly?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(value);

  useEffect(() => {
    setLocal(value);
    lastSent.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const schedule = (next: string) => {
    if (readOnly) return;
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (next === lastSent.current) return;
      lastSent.current = next;
      onCommit(next);
    }, 450);
  };

  return (
    <input
      type="text"
      inputMode={inputMode}
      value={local}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(e) => schedule(e.target.value)}
      onBlur={() => {
        if (readOnly) return;
        if (timer.current) clearTimeout(timer.current);
        if (local !== lastSent.current) {
          lastSent.current = local;
          onCommit(local);
        }
      }}
      className={
        className ||
        [
          "w-full min-h-11 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1.5 sm:text-sm",
          readOnly ? "cursor-default bg-zinc-50 text-zinc-700" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
    />
  );
}

function dealVehicleLabel(deal: Deal): string {
  const title = (deal.title || "").trim();
  const lot = (deal.lot_number || "").trim();
  if (!lot) return title;
  if (title.includes(`Lot#${lot}`) || title.includes(lot)) return title;
  return `${title} Lot#${lot}`.trim();
}

export function DealDismantleMap({ deal }: Props) {
  const [map, setMap] = useState<DismantleMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [downloading, setDownloading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const saveFlash = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vehicleLabel = useMemo(() => dealVehicleLabel(deal), [deal]);
  const completed = Boolean(map?.completed);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDismantleMap(deal.id);
      setMap(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить карту разбора");
    } finally {
      setLoading(false);
    }
  }, [deal.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (saveFlash.current) clearTimeout(saveFlash.current);
    };
  }, []);

  const markSaved = () => {
    setSaveState("saved");
    if (saveFlash.current) clearTimeout(saveFlash.current);
    saveFlash.current = setTimeout(() => setSaveState("idle"), 1200);
  };

  const saveCell = async (key: string, field: Field, value: string) => {
    if (completed) return;
    setSaveState("saving");
    setError(null);
    try {
      const updated = await patchDismantleCell(deal.id, key, { [field]: value });
      setMap((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cells: prev.cells.map((c) => (c.key === key ? { ...c, ...updated } : c)),
          updated_at: new Date().toISOString(),
        };
      });
      markSaved();
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    }
  };

  const setCompleted = async (next: boolean) => {
    setCompleting(true);
    setError(null);
    try {
      const updated = await patchDismantleMeta(deal.id, { completed: next });
      setMap(updated);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : next
            ? "Не удалось отметить карту"
            : "Не удалось снять отметку",
      );
    } finally {
      setCompleting(false);
    }
  };

  const onDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadDismantleMapXlsx(deal.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось скачать Excel");
    } finally {
      setDownloading(false);
    }
  };

  const grouped = useMemo(() => {
    if (!map) return [];
    const order = map.sections.length
      ? map.sections
      : Array.from(new Set(map.cells.map((c) => c.section).filter(Boolean)));
    return order
      .map((section) => ({
        section,
        cells: map.cells.filter((c) => c.section === section),
      }))
      .filter((g) => g.cells.length > 0);
  }, [map]);

  if (deal.origin_point !== "dismantle") {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold sm:text-base">
              {map?.title || "Карта разбора"}
            </h3>
            {completed ? (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                Заполнена
              </span>
            ) : (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  saveState === "saving"
                    ? "bg-amber-50 text-amber-800"
                    : saveState === "saved"
                      ? "bg-emerald-50 text-emerald-800"
                      : saveState === "error"
                        ? "bg-red-50 text-red-700"
                        : "bg-zinc-100 text-text-muted"
                }`}
              >
                {saveState === "saving"
                  ? "Сохранение…"
                  : saveState === "saved"
                    ? "Сохранено"
                    : saveState === "error"
                      ? "Ошибка"
                      : "Автосохранение"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {completed
              ? "Карта отмечена как заполненная. Менеджер получил уведомление в Telegram."
              : "Заполните позиции. Когда готово — отметьте карту как заполненную."}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={downloading || loading || !map}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-600/40 bg-white px-3.5 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 sm:min-h-0 sm:w-auto"
          >
            {downloading ? "Скачиваем…" : "Скачать Excel"}
          </button>
          <button
            type="button"
            onClick={() => void setCompleted(!completed)}
            disabled={completing || loading || !map}
            className={[
              "inline-flex min-h-11 w-full items-center justify-center rounded-lg px-3.5 py-2.5 text-sm font-semibold disabled:opacity-50 sm:min-h-0 sm:w-auto",
              completed
                ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                : "bg-emerald-600 text-white hover:bg-emerald-500",
            ].join(" ")}
          >
            {completing
              ? "Сохраняем…"
              : completed
                ? "Снять отметку"
                : "Отметить как заполненную"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-3 text-sm text-text-secondary">Загрузка карты…</p>
      ) : map ? (
        <div className="mt-3 space-y-4">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {map.vehicle_header_hint || "Марка, модель, Lot#"}
            </p>
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-900">
              {vehicleLabel || "—"}
            </p>
            <p className="mt-1 text-[11px] text-text-muted">
              Берётся из сделки. Меняет только менеджер в названии сделки.
            </p>
          </div>

          {/* Mobile: stacked cards */}
          <div className="space-y-4 md:hidden">
            {grouped.map((group) => (
              <MobileSection
                key={group.section}
                section={group.section}
                cells={group.cells}
                onSave={saveCell}
                readOnly={completed}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="w-10 border-b border-border px-2 py-2 font-semibold">№</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">
                    Наименование
                  </th>
                  <th className="w-20 border-b border-border px-2 py-2 font-semibold">Кол</th>
                  <th className="w-28 border-b border-border px-2 py-2 font-semibold">
                    Доп упак
                  </th>
                  <th className="w-40 border-b border-border px-2 py-2 font-semibold">
                    Примечание
                  </th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((group) => (
                  <DesktopSectionRows
                    key={group.section}
                    section={group.section}
                    cells={group.cells}
                    onSave={saveCell}
                    readOnly={completed}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MobileSection({
  section,
  cells,
  onSave,
  readOnly,
}: {
  section: string;
  cells: DismantleCell[];
  onSave: (key: string, field: Field, value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="bg-[#0D3F10]/[0.08] px-3 py-2.5 text-xs font-semibold text-[#0D3F10]">
        {section}
      </div>
      <ul className="divide-y divide-border">
        {cells.map((cell) => (
          <li key={cell.key} className="space-y-2.5 bg-white p-3">
            <div className="flex items-start gap-2">
              {!cell.is_note_only && cell.num != null ? (
                <span className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 px-1.5 text-[11px] font-semibold text-text-muted">
                  {cell.num}
                </span>
              ) : null}
              <p className="text-sm font-medium leading-snug text-text-primary">{cell.name}</p>
            </div>
            {cell.is_note_only ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  Примечание
                </span>
                <CellInput
                  value={cell.note}
                  onCommit={(v) => onSave(cell.key, "note", v)}
                  placeholder="—"
                  readOnly={readOnly}
                />
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Кол
                  </span>
                  <CellInput
                    value={cell.qty}
                    onCommit={(v) => onSave(cell.key, "qty", v)}
                    placeholder="0"
                    inputMode="numeric"
                    readOnly={readOnly}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Доп упак
                  </span>
                  <CellInput
                    value={cell.packing}
                    onCommit={(v) => onSave(cell.key, "packing", v)}
                    placeholder="—"
                    readOnly={readOnly}
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Примечание
                  </span>
                  <CellInput
                    value={cell.note}
                    onCommit={(v) => onSave(cell.key, "note", v)}
                    placeholder="—"
                    readOnly={readOnly}
                  />
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DesktopSectionRows({
  section,
  cells,
  onSave,
  readOnly,
}: {
  section: string;
  cells: DismantleCell[];
  onSave: (key: string, field: Field, value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <>
      <tr className="bg-[#0D3F10]/[0.06]">
        <td
          colSpan={5}
          className="border-b border-border px-2 py-2 text-xs font-semibold text-[#0D3F10]"
        >
          {section}
        </td>
      </tr>
      {cells.map((cell) => (
        <tr key={cell.key} className="align-top hover:bg-zinc-50/80">
          <td className="border-b border-border px-2 py-1.5 text-xs text-text-muted">
            {cell.is_note_only ? "" : cell.num ?? ""}
          </td>
          <td className="border-b border-border px-2 py-1.5 text-sm text-text-primary">
            {cell.name}
          </td>
          <td className="border-b border-border px-1.5 py-1">
            {cell.is_note_only ? (
              <span className="text-xs text-text-muted">—</span>
            ) : (
              <CellInput
                value={cell.qty}
                onCommit={(v) => onSave(cell.key, "qty", v)}
                placeholder="0"
                readOnly={readOnly}
              />
            )}
          </td>
          <td className="border-b border-border px-1.5 py-1">
            {cell.is_note_only ? (
              <span className="text-xs text-text-muted">—</span>
            ) : (
              <CellInput
                value={cell.packing}
                onCommit={(v) => onSave(cell.key, "packing", v)}
                placeholder="—"
                readOnly={readOnly}
              />
            )}
          </td>
          <td className="border-b border-border px-1.5 py-1">
            <CellInput
              value={cell.note}
              onCommit={(v) => onSave(cell.key, "note", v)}
              placeholder="—"
              readOnly={readOnly}
            />
          </td>
        </tr>
      ))}
    </>
  );
}
