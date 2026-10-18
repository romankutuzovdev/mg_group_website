"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deal, DismantleCell, DismantleMap } from "@/lib/api/cabinet";
import {
  downloadDismantleMapXlsx,
  fetchDismantleMap,
  patchDismantleCell,
  patchDismantleMeta,
} from "@/lib/api/cabinet";
import { IosWheelPicker } from "@/components/cabinet/ios-wheel-picker";

type Field = "qty" | "packing" | "note";
type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  deal: Deal;
  /** Менеджер/админ может править карту после отметки «заполнена». */
  isManager?: boolean;
};

function managerContact(deal: Deal): {
  label: string;
  href: string | null;
} {
  const username = (deal.manager_username || "").replace(/^@/, "").trim();
  const name = (deal.manager_name || "").trim();
  if (username) {
    return {
      label: name ? `${name} (@${username})` : `@${username}`,
      href: `https://t.me/${username}`,
    };
  }
  if (name) {
    return { label: name, href: null };
  }
  if (deal.manager_telegram_id) {
    return {
      label: `Telegram ID ${deal.manager_telegram_id}`,
      href: `tg://user?id=${deal.manager_telegram_id}`,
    };
  }
  return { label: "ваш менеджер", href: null };
}

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const localRef = useRef(value);
  localRef.current = local;

  useEffect(() => {
    // Don't pull a stale server echo over text the user is still editing.
    if (inputRef.current && document.activeElement === inputRef.current) return;
    if (localRef.current !== lastSent.current) return;
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
      ref={inputRef}
      type="text"
      inputMode={inputMode}
      value={local}
      placeholder={placeholder}
      readOnly={Boolean(readOnly)}
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

function NoteTextarea({
  value,
  onCommit,
  placeholder,
  readOnly,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(value);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const localRef = useRef(value);
  localRef.current = local;

  useEffect(() => {
    if (areaRef.current && document.activeElement === areaRef.current) return;
    if (localRef.current !== lastSent.current) return;
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
    }, 500);
  };

  return (
    <textarea
      ref={areaRef}
      value={local}
      placeholder={placeholder}
      readOnly={Boolean(readOnly)}
      rows={4}
      onChange={(e) => schedule(e.target.value)}
      onBlur={() => {
        if (readOnly) return;
        if (timer.current) clearTimeout(timer.current);
        if (local !== lastSent.current) {
          lastSent.current = local;
          onCommit(local);
        }
      }}
      className={[
        "w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none",
        "focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30",
        readOnly ? "cursor-default bg-zinc-50 text-zinc-700" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

/** Доп. упаковка: только «да» или прочерк (пусто). */
function normalizePacking(raw: string): string {
  const v = (raw || "").trim().toLowerCase();
  if (v === "да" || v === "yes" || v === "y" || v === "+") return "да";
  return "";
}

function SaveSelect({
  value,
  choices,
  onCommit,
  readOnly,
  strictChoices,
}: {
  value: string;
  choices: string[];
  onCommit: (next: string) => void;
  readOnly?: boolean;
  /** Не подмешивать произвольное текущее значение в список */
  strictChoices?: boolean;
}) {
  const options = useMemo(() => {
    const base = choices.length ? choices : ["да", "нет", "все"];
    if (!strictChoices && value && !base.includes(value)) return [value, ...base];
    return base;
  }, [choices, value, strictChoices]);

  return (
    <select
      value={value}
      disabled={readOnly}
      onChange={(e) => onCommit(e.target.value)}
      className={[
        "w-full min-h-11 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1.5 sm:text-sm",
        readOnly ? "cursor-default bg-zinc-50 text-zinc-700" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function dealVehicleLabel(deal: Deal): string {
  const title = (deal.title || "").trim();
  const lot = (deal.lot_number || "").trim();
  if (!lot) return title;
  if (title.includes(`Lot#${lot}`) || title.includes(lot)) return title;
  return `${title} Lot#${lot}`.trim();
}

export function DealDismantleMap({ deal, isManager = false }: Props) {
  const [map, setMap] = useState<DismantleMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [downloading, setDownloading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const saveFlash = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vehicleLabel = useMemo(() => dealVehicleLabel(deal), [deal]);
  const completed = Boolean(map?.completed);
  const lockedForClient = completed && !isManager;
  const readOnly = lockedForClient ? true : false;
  const contact = useMemo(() => managerContact(deal), [deal]);
  const isUsa = (map?.variant || deal.origin_region) === "usa";
  const qtyChoices = map?.qty_choices?.length ? map.qty_choices : ["да", "нет", "все"];
  const colQty = map?.columns?.qty || (isUsa ? "Снять" : "Кол");
  const colPack = map?.columns?.packing;
  const colNote = map?.columns?.note || "Примечание";
  const showPacking = !isUsa && colPack != null && colPack !== "";
  const showNameEn = Boolean(map?.columns?.name_en || isUsa);

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
  }, [load, deal.origin_region]);

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
    if (lockedForClient) return;
    setSaveState("saving");
    setError(null);
    try {
      await patchDismantleCell(deal.id, key, { [field]: value });
      setMap((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cells: prev.cells.map((c) =>
            c.key === key ? { ...c, [field]: value } : c,
          ),
          updated_at: new Date().toISOString(),
        };
      });
      markSaved();
    } catch (err) {
      setSaveState("error");
      const msg = err instanceof Error ? err.message : "Ошибка сохранения";
      setError(
        /map_locked|403/i.test(msg)
          ? "Карта уже отмечена. Чтобы изменить — напишите менеджеру."
          : msg,
      );
    }
  };

  const saveGeneralNote = async (value: string) => {
    if (lockedForClient) return;
    setSaveState("saving");
    setError(null);
    try {
      const updated = await patchDismantleMeta(deal.id, { general_note: value });
      setMap(updated);
      markSaved();
    } catch (err) {
      setSaveState("error");
      const msg = err instanceof Error ? err.message : "Ошибка сохранения";
      setError(
        /map_locked|403/i.test(msg)
          ? "Карта уже отмечена. Чтобы изменить — напишите менеджеру."
          : msg,
      );
    }
  };

  const setCompleted = async (next: boolean) => {
    if (!isManager && completed && !next) {
      setError("Карта уже отмечена. Чтобы изменить — свяжитесь с менеджером.");
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      const updated = await patchDismantleMeta(deal.id, { completed: next });
      setMap(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /map_locked|403/i.test(msg)
          ? "Карта уже отмечена. Чтобы изменить — свяжитесь с менеджером."
          : msg || (next ? "Не удалось отметить карту" : "Не удалось снять отметку"),
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

  const regionBadge =
    (map?.origin_region || deal.origin_region) === "uk" ? "Англия" : "США";

  return (
    <section className="rounded-xl border border-border bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold sm:text-base">
              {map?.title || "Карта разбора"}
            </h3>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
              {regionBadge}
            </span>
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
            {lockedForClient
              ? "Карта отмечена как заполненная. Изменить её может только менеджер."
              : completed && isManager
                ? "Карта заполнена. Вы можете править позиции или снять отметку."
                : completed
                  ? "Карта отмечена как заполненная. Менеджер получил уведомление в Telegram."
                  : isUsa
                    ? "Карта США: для каждой позиции укажите «да», «нет» или «все». Отметить можно один раз."
                    : "Карта Англии: количество и доп. упаковка (да / —). Отметить можно один раз."}
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
          {!lockedForClient ? (
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
          ) : null}
        </div>
      </div>

      {lockedForClient ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <p className="font-medium">Нужно изменить карту разбора?</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Свяжитесь с вашим менеджером — после отметки править карту можете только вы через него.
          </p>
          <p className="mt-2 text-sm">
            Менеджер:{" "}
            {contact.href ? (
              <a
                href={contact.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-800 underline underline-offset-2"
              >
                {contact.label}
              </a>
            ) : (
              <span className="font-semibold">{contact.label}</span>
            )}
          </p>
        </div>
      ) : null}

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
              Чтобы сменить бланк карты — смените регион (США / Англия) в маршруте.
            </p>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Комментарий / свободный текст
            </p>
            <NoteTextarea
              value={map.general_note || ""}
              onCommit={(v) => void saveGeneralNote(v)}
              readOnly={readOnly}
              placeholder="Любые пожелания, уточнения по разбору, упаковке, срокам…"
            />
            <p className="mt-1 text-[11px] text-text-muted">
              Сохраняется автоматически. Попадёт в Excel при скачивании.
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
                readOnly={readOnly}
                isUsa={isUsa}
                showPacking={showPacking}
                showNameEn={showNameEn}
                colQty={colQty}
                colPack={colPack || "Доп упак"}
                colNote={colNote}
                qtyChoices={qtyChoices}
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
                    {showNameEn ? "Наименование / Part name" : "Наименование"}
                  </th>
                  <th className="w-28 border-b border-border px-2 py-2 font-semibold">
                    {colQty}
                  </th>
                  {showPacking ? (
                    <th className="w-28 border-b border-border px-2 py-2 font-semibold">
                      {colPack}
                    </th>
                  ) : null}
                  <th className="w-40 border-b border-border px-2 py-2 font-semibold">
                    {colNote}
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
                    readOnly={readOnly}
                    isUsa={isUsa}
                    showPacking={showPacking}
                    showNameEn={showNameEn}
                    qtyChoices={qtyChoices}
                    colSpan={3 + (showPacking ? 1 : 0) + 1}
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
  isUsa,
  showPacking,
  showNameEn,
  colQty,
  colPack,
  colNote,
  qtyChoices,
}: {
  section: string;
  cells: DismantleCell[];
  onSave: (key: string, field: Field, value: string) => void;
  readOnly?: boolean;
  isUsa: boolean;
  showPacking: boolean;
  showNameEn: boolean;
  colQty: string;
  colPack: string;
  colNote: string;
  qtyChoices: string[];
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
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug text-text-primary">{cell.name}</p>
                {showNameEn && cell.name_en ? (
                  <p className="mt-0.5 text-xs leading-snug text-text-muted">{cell.name_en}</p>
                ) : null}
              </div>
            </div>
            {cell.is_note_only ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  {colNote}
                </span>
                <CellInput
                  value={cell.note}
                  onCommit={(v) => onSave(cell.key, "note", v)}
                  placeholder="—"
                  readOnly={readOnly}
                />
              </label>
            ) : (
              <div className={`grid gap-2 ${showPacking ? "grid-cols-2" : "grid-cols-1"}`}>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    {colQty}
                    {isUsa ? " (да / нет / все)" : ""}
                  </span>
                  {isUsa ? (
                    <SaveSelect
                      value={cell.qty}
                      choices={qtyChoices}
                      onCommit={(v) => onSave(cell.key, "qty", v)}
                      readOnly={readOnly}
                    />
                  ) : (
                    <IosWheelPicker
                      value={cell.qty}
                      onCommit={(v) => onSave(cell.key, "qty", v)}
                      min={0}
                      max={20}
                      readOnly={readOnly}
                      ariaLabel={colQty}
                    />
                  )}
                </label>
                {showPacking ? (
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      {colPack} (да / —)
                    </span>
                    <SaveSelect
                      value={normalizePacking(cell.packing)}
                      choices={["да"]}
                      strictChoices
                      onCommit={(v) =>
                        onSave(cell.key, "packing", normalizePacking(v))
                      }
                      readOnly={readOnly}
                    />
                  </label>
                ) : null}
                <label className={`block ${showPacking ? "col-span-2" : ""}`}>
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    {colNote}
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
  isUsa,
  showPacking,
  showNameEn,
  qtyChoices,
  colSpan,
}: {
  section: string;
  cells: DismantleCell[];
  onSave: (key: string, field: Field, value: string) => void;
  readOnly?: boolean;
  isUsa: boolean;
  showPacking: boolean;
  showNameEn: boolean;
  qtyChoices: string[];
  colSpan: number;
}) {
  return (
    <>
      <tr className="bg-[#0D3F10]/[0.06]">
        <td
          colSpan={colSpan}
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
            <div>{cell.name}</div>
            {showNameEn && cell.name_en ? (
              <div className="mt-0.5 text-xs text-text-muted">{cell.name_en}</div>
            ) : null}
          </td>
          <td className="border-b border-border px-1.5 py-1">
            {cell.is_note_only ? (
              <span className="text-xs text-text-muted">—</span>
            ) : isUsa ? (
              <SaveSelect
                value={cell.qty}
                choices={qtyChoices}
                onCommit={(v) => onSave(cell.key, "qty", v)}
                readOnly={readOnly}
              />
            ) : (
              <IosWheelPicker
                value={cell.qty}
                onCommit={(v) => onSave(cell.key, "qty", v)}
                min={0}
                max={20}
                readOnly={readOnly}
                ariaLabel="Кол"
              />
            )}
          </td>
          {showPacking ? (
            <td className="border-b border-border px-1.5 py-1">
              {cell.is_note_only ? (
                <span className="text-xs text-text-muted">—</span>
              ) : (
                <SaveSelect
                  value={normalizePacking(cell.packing)}
                  choices={["да"]}
                  strictChoices
                  onCommit={(v) =>
                    onSave(cell.key, "packing", normalizePacking(v))
                  }
                  readOnly={readOnly}
                />
              )}
            </td>
          ) : null}
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
