"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deal, DismantleCell, DismantleMap } from "@/lib/api/cabinet";
import {
  DISMANTLE_YARD_LABELS,
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
  const variant = map?.variant || deal.origin_region;
  const isUsa = variant.startsWith("usa");
  const colQty = map?.columns?.qty || (isUsa ? "Снять" : "Кол");
  const colPack = map?.columns?.packing;
  const colNote = map?.columns?.note || "Примечание";
  const showPacking = !isUsa && colPack != null && colPack !== "";
  const showNameEn = Boolean(map?.columns?.name_en);
  // В бланке New Jersey 0 значит «не снимать».
  const qtyMin = variant === "usa" ? 1 : 0;
  const qtyMax = isUsa ? 15 : 20;
  // Бланк Texas: в колонке «Снять» не число, а да / нет / все.
  const qtyWords = variant === "usa_tx" ? map?.qty_choices || [] : null;
  const qtyRange = qtyWords ? "да / нет / все" : `${qtyMin}–${qtyMax}`;

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
  }, [load, deal.origin_region, deal.dismantle_yard]);

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

  const saveYardCode = async (value: string) => {
    if (!isManager) return;
    setSaveState("saving");
    setError(null);
    try {
      const updated = await patchDismantleMeta(deal.id, { yard_code: value.trim().toUpperCase() });
      setMap(updated);
      markSaved();
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Не удалось сохранить код машины");
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

  const yard = deal.dismantle_yard ? DISMANTLE_YARD_LABELS[deal.dismantle_yard] : "";
  const regionBadge =
    (map?.origin_region || deal.origin_region) === "uk"
      ? "Англия"
      : yard
        ? `США · ${yard}`
        : "США";

  // Одни и те же кнопки сверху и снизу карты — после длинной таблицы не нужно
  // прокручивать наверх, чтобы отметить карту заполненной.
  const actionButtons = (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <button
        type="button"
        onClick={() => void onDownload()}
        disabled={downloading || loading || !map}
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 sm:w-auto"
      >
        {downloading ? "Скачиваем…" : "Скачать Excel"}
      </button>
      {!lockedForClient ? (
        <button
          type="button"
          onClick={() => void setCompleted(!completed)}
          disabled={completing || loading || !map}
          className={[
            "inline-flex h-9 w-full items-center justify-center rounded-md px-3.5 text-[13px] font-medium shadow-sm transition disabled:opacity-50 sm:w-auto",
            completed
              ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              : "bg-emerald-600 text-white hover:bg-emerald-700",
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
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">
              {map?.title || "Карта разбора"}
            </h3>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
              {regionBadge}
            </span>
            {completed ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Заполнена
              </span>
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-zinc-200 ${
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
          <p className="mt-0.5 text-xs text-zinc-500">
            {lockedForClient
              ? "Карта отмечена как заполненная. Изменить её может только менеджер."
              : completed && isManager
                ? "Карта заполнена. Вы можете править позиции или снять отметку."
                : completed
                  ? "Карта отмечена как заполненная. Менеджер получил уведомление в Telegram."
                  : isUsa
                    ? qtyWords
                      ? "Карта Texas: для каждой позиции укажите «да», «все» или «нет». Пропущенные позиции сниматься не будут. Отметить можно один раз."
                      : `Карта США: для каждой позиции укажите количество ${qtyRange} (как будильник на iPhone). Отметить можно один раз.`
                    : "Карта Англии: количество и доп. упаковка (да / —). Отметить можно один раз."}
          </p>
        </div>
        {actionButtons}
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
          {map.header_lines && map.header_lines.length >= 2 ? (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                {map.vehicle_header_hint || "Шапка бланка"}
              </p>
              {/* Как в бланке разборки: две строки слева, код машины справа */}
              <div className="flex overflow-hidden rounded-lg border border-zinc-300 bg-white">
                <div className="min-w-0 flex-1 divide-y divide-zinc-300">
                  <p className="whitespace-pre-wrap px-3 py-2 text-center text-sm font-semibold text-zinc-900">
                    {map.header_lines[0] || "—"}
                  </p>
                  <p className="whitespace-pre-wrap px-3 py-1.5 text-center text-[13px] font-semibold text-zinc-800">
                    {map.header_lines[1] || "—"}
                  </p>
                </div>
                <div className="flex w-28 shrink-0 items-center justify-center border-l-2 border-zinc-800 px-2">
                  {isManager ? (
                    <CellInput
                      value={map.yard_code || ""}
                      onCommit={(v) => void saveYardCode(v)}
                      placeholder="X000"
                      className="w-full rounded-md border border-dashed border-zinc-300 bg-white px-2 py-1.5 text-center text-xl font-bold uppercase tracking-wide text-zinc-900 outline-none focus:border-emerald-500"
                    />
                  ) : (
                    <span className="text-xl font-bold uppercase tracking-wide text-zinc-900">
                      {map.yard_code || "—"}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-1 text-[11px] text-text-muted">
                Берётся из сделки: название, цвет и двигатель из характеристик лота, Stock# — номер лота.
                {isManager
                  ? " Код машины справа (X000) ставит менеджер, он попадёт в Excel."
                  : " Код машины справа ставит менеджер."}{" "}
                Чтобы сменить бланк карты — смените регион или разборку в маршруте.
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                {map.vehicle_header_hint || "Марка, модель, Lot#"}
              </p>
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-900">
                {vehicleLabel || "—"}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">
                Берётся из сделки. Меняет только менеджер в названии сделки.
                Чтобы сменить бланк карты — смените регион или разборку в маршруте.
              </p>
            </div>
          )}

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
                qtyMin={qtyMin}
                qtyMax={qtyMax}
                qtyWords={qtyWords}
                qtyRange={qtyRange}
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
                    qtyMin={qtyMin}
                    qtyMax={qtyMax}
                    qtyWords={qtyWords}
                    colSpan={3 + (showPacking ? 1 : 0) + 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {map ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            {completed
              ? "Карта отмечена как заполненная."
              : "Проверили все позиции? Отметьте карту заполненной, менеджер получит уведомление."}
          </p>
          {actionButtons}
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
  qtyMin,
  qtyMax,
  qtyWords,
  qtyRange,
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
  qtyMin: number;
  qtyMax: number;
  qtyWords: string[] | null;
  qtyRange: string;
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
                    {isUsa ? ` (${qtyRange})` : ""}
                  </span>
                  {qtyWords ? (
                    <SaveSelect
                      value={cell.qty}
                      choices={qtyWords}
                      onCommit={(v) => onSave(cell.key, "qty", v)}
                      readOnly={readOnly}
                    />
                  ) : (
                    <IosWheelPicker
                      value={cell.qty}
                      onCommit={(v) => onSave(cell.key, "qty", v)}
                      min={qtyMin}
                      max={qtyMax}
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
  qtyMin,
  qtyMax,
  qtyWords,
  colSpan,
}: {
  section: string;
  cells: DismantleCell[];
  onSave: (key: string, field: Field, value: string) => void;
  readOnly?: boolean;
  isUsa: boolean;
  showPacking: boolean;
  showNameEn: boolean;
  qtyMin: number;
  qtyMax: number;
  qtyWords: string[] | null;
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
            ) : qtyWords ? (
              <SaveSelect
                value={cell.qty}
                choices={qtyWords}
                onCommit={(v) => onSave(cell.key, "qty", v)}
                readOnly={readOnly}
              />
            ) : (
              <IosWheelPicker
                value={cell.qty}
                onCommit={(v) => onSave(cell.key, "qty", v)}
                min={qtyMin}
                max={qtyMax}
                readOnly={readOnly}
                ariaLabel={isUsa ? "Снять" : "Кол"}
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
