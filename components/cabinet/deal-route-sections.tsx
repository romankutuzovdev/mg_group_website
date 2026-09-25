"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Deal,
  DealMedia,
  OriginPoint,
  OriginRegion,
  StageKey,
} from "@/lib/api/cabinet";
import {
  MAP_STAGE_KEYS,
  adminUpdateDeal,
  adminUpdateStage,
  adminUploadDealMedia,
  fetchMyDeal,
  mediaAbsoluteUrl,
} from "@/lib/api/cabinet";

type Section = {
  key: StageKey;
  label: string;
  hint: string;
  status: "pending" | "active" | "done";
  note: string;
  photos: DealMedia[];
};

function statusWord(status: Section["status"]): string {
  if (status === "done") return "Пройдено";
  if (status === "active") return "Сейчас";
  return "Впереди";
}

function buildSections(deal: Deal): Section[] {
  const byKey = Object.fromEntries(deal.stages.map((s) => [s.key, s]));
  const originLabel = deal.origin_point === "port" ? "Порт" : "Разборка";
  const originHint =
    deal.origin_region === "uk"
      ? "Старт в Англии"
      : "Старт в США";

  const meta: Record<StageKey, { label: string; hint: string }> = {
    selection: { label: "Подбор", hint: "" },
    auction: { label: "Аукцион", hint: "" },
    origin: { label: originLabel, hint: originHint },
    ocean: { label: "Море", hint: "Переход через океан" },
    belarus: { label: "Беларусь", hint: "Таможня и склад" },
    delivery: { label: "Клиент", hint: "Выдача" },
  };

  return MAP_STAGE_KEYS.map((key) => {
    const stage = byKey[key];
    return {
      key,
      label: key === "origin" ? originLabel : stage?.label || meta[key].label,
      hint: meta[key].hint,
      status: stage?.status || "pending",
      note: stage?.note || "",
      photos: deal.media.filter(
        (m) => m.stage_key === key && m.kind === "photo",
      ),
    };
  });
}

type Props = {
  deal: Deal;
  isAdmin?: boolean;
  onUpdated?: (deal: Deal) => void;
};

export function DealRouteSections({ deal, isAdmin = false, onUpdated }: Props) {
  const [openKey, setOpenKey] = useState<StageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const fileRefs = useRef<Partial<Record<StageKey, HTMLInputElement | null>>>({});

  const sections = useMemo(() => buildSections(deal), [deal]);

  useEffect(() => {
    const active = sections.find((s) => s.status === "active");
    setOpenKey((prev) => prev || active?.key || sections[0]?.key || null);
  }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const s of sections) next[s.key] = s.note;
    setNotes(next);
  }, [deal.id, deal.stages]);

  const regionLabel = deal.origin_region === "uk" ? "Англия" : "США";
  const doneCount = sections.filter((s) => s.status === "done").length;

  const refresh = async () => {
    const next = await fetchMyDeal(deal.id);
    onUpdated?.(next);
    return next;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  const setRoute = (patch: {
    origin_region?: OriginRegion;
    origin_point?: OriginPoint;
  }) =>
    void run(async () => {
      const updated = await adminUpdateDeal(deal.id, patch);
      onUpdated?.(updated);
    });

  const markSection = (key: StageKey, status: "active" | "done" | "pending") =>
    void run(async () => {
      const order: StageKey[] = [
        "selection",
        "auction",
        "origin",
        "ocean",
        "belarus",
        "delivery",
      ];
      if (status === "active") {
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
      const updated = await adminUpdateStage(deal.id, key, {
        status,
        note: (notes[key] ?? "").trim(),
      });
      onUpdated?.(updated);
      if (status === "done") {
        const idx = order.indexOf(key);
        const nextKey = order[idx + 1];
        if (nextKey) setOpenKey(nextKey);
      } else {
        setOpenKey(key);
      }
    });

  const saveNote = (key: StageKey) =>
    void run(async () => {
      const stage = deal.stages.find((s) => s.key === key);
      const updated = await adminUpdateStage(deal.id, key, {
        status: stage?.status || "pending",
        note: (notes[key] ?? "").trim(),
      });
      onUpdated?.(updated);
    });

  const uploadPhotos = (key: StageKey, files: FileList | null) => {
    if (!files?.length) return;
    void run(async () => {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        await adminUploadDealMedia(deal.id, file, key);
      }
      await refresh();
      setOpenKey(key);
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="border-b border-border bg-gradient-to-br from-zinc-50 to-emerald-50/50 px-4 py-3.5 sm:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/80">
          Путь автомобиля
        </p>
        <p className="mt-1 font-display text-lg font-semibold tracking-tight text-zinc-900">
          {regionLabel}
          <span className="mx-2 text-zinc-300">→</span>
          Беларусь
          <span className="mx-2 text-zinc-300">→</span>
          Клиент
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {doneCount} из {sections.length} секций пройдено
        </p>

        {isAdmin ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
              <span className="text-zinc-500">Старт</span>
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

      <ol className="divide-y divide-border">
        {sections.map((section, idx) => {
          const open = openKey === section.key;
          const isActive = section.status === "active";
          const isDone = section.status === "done";

          return (
            <li key={section.key} className={isActive ? "bg-emerald-50/40" : "bg-white"}>
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : section.key)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
              >
                <span
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    isDone
                      ? "bg-emerald-600 text-white"
                      : isActive
                        ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-400"
                        : "bg-zinc-100 text-zinc-500",
                  ].join(" ")}
                >
                  {isDone ? "✓" : idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-base font-semibold text-zinc-900">
                      {section.label}
                    </p>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        isDone
                          ? "bg-emerald-100 text-emerald-800"
                          : isActive
                            ? "bg-emerald-600 text-white"
                            : "bg-zinc-200 text-zinc-600",
                      ].join(" ")}
                    >
                      {statusWord(section.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {section.hint}
                    {section.photos.length
                      ? ` · ${section.photos.length} фото`
                      : ""}
                  </p>
                </div>
                <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
              </button>

              {open ? (
                <div className="space-y-3 px-4 pb-4 sm:px-5 sm:pl-[4.25rem]">
                  {!isAdmin && section.note ? (
                    <p className="text-sm leading-relaxed text-zinc-600">{section.note}</p>
                  ) : null}
                  {!isAdmin && !section.note ? (
                    <p className="text-sm text-zinc-400">Нет заметки по секции</p>
                  ) : null}

                  {section.photos.length > 0 ? (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {section.photos.map((photo) => (
                        <li
                          key={photo.id}
                          className="overflow-hidden rounded-xl border border-border bg-zinc-50"
                        >
                          <a
                            href={mediaAbsoluteUrl(photo.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={mediaAbsoluteUrl(photo.url)}
                              alt={photo.caption || photo.filename || section.label}
                              className="aspect-[4/3] w-full object-cover"
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">
                      Пока нет фото в этой секции
                    </p>
                  )}

                  {isAdmin ? (
                    <div className="space-y-2.5 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/80">
                        Управление секцией
                      </p>
                      <label className="block text-xs">
                        <span className="text-zinc-600">Заметка для клиента</span>
                        <textarea
                          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm"
                          rows={2}
                          value={notes[section.key] ?? ""}
                          disabled={busy}
                          onChange={(e) =>
                            setNotes((prev) => ({
                              ...prev,
                              [section.key]: e.target.value,
                            }))
                          }
                          placeholder="Что происходит на этом этапе…"
                        />
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveNote(section.key)}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Сохранить заметку
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => markSection(section.key, "active")}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          Сделать текущей
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => markSection(section.key, "done")}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Пройдена
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => markSection(section.key, "pending")}
                          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Сбросить
                        </button>
                      </div>

                      <div>
                        <input
                          ref={(el) => {
                            fileRefs.current[section.key] = el;
                          }}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            uploadPhotos(section.key, e.target.files);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => fileRefs.current[section.key]?.click()}
                          className="w-full rounded-lg border border-dashed border-emerald-400 bg-white px-3 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          + Загрузить фото в эту секцию
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {busy ? (
        <p className="border-t border-border px-4 py-2 text-xs text-zinc-500">
          Сохраняем…
        </p>
      ) : null}
    </div>
  );
}
