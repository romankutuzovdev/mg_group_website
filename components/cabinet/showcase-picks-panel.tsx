"use client";

import { useEffect, useState } from "react";
import {
  staffDeleteShowcasePick,
  staffListShowcase,
  staffPatchShowcasePick,
  type ShowcasePick,
} from "@/lib/api/cabinet";

const KIND_LABEL = { restoration: "Восстановление", kit: "Машинокомплект" } as const;
const REGION_LABEL: Record<string, string> = { usa: "США", uk: "Англия", china: "Китай", korea: "Корея" };

function usd(amount: number | null) {
  return amount ? `$${Math.round(amount).toLocaleString("ru-RU")}` : "—";
}

type Filter = "all" | "home" | "bought";

/** Что менеджеры отправили на главную из калькуляторов и что отметили «Купили». */
export function ShowcasePicksPanel({ showManager }: { showManager: boolean }) {
  const [rows, setRows] = useState<ShowcasePick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;
    staffListShowcase()
      .then((list) => !cancelled && setRows(list))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Не удалось загрузить"));
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (row: ShowcasePick, body: { on_home?: boolean; bought?: boolean }) => {
    setBusyId(row.id);
    setError(null);
    try {
      const next = await staffPatchShowcasePick(row.id, body);
      setRows((prev) => prev?.map((r) => (r.id === row.id ? next : r)) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: ShowcasePick) => {
    if (!window.confirm("Удалить лот с витрины?")) return;
    setBusyId(row.id);
    setError(null);
    try {
      await staffDeleteShowcasePick(row.id);
      setRows((prev) => prev?.filter((r) => r.id !== row.id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusyId(null);
    }
  };

  const visible = (rows ?? []).filter((r) =>
    filter === "home" ? r.on_home && !r.bought : filter === "bought" ? r.bought : true,
  );

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
        <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5 text-xs">
          {(
            [
              ["all", "Все"],
              ["home", "На главной"],
              ["bought", "Купили"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded px-2.5 py-1 font-medium ${filter === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {rows ? <span className="text-xs tabular-nums text-zinc-500">{visible.length} лотов</span> : null}
      </div>
      {error ? <p className="px-5 py-3 text-[13px] text-rose-700">{error}</p> : null}
      {rows == null && !error ? <p className="px-5 py-4 text-[13px] text-zinc-500">Загрузка…</p> : null}
      {rows && visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-zinc-500">
          Пусто. В калькуляторе после просчёта нажмите «На главную» или «Купили».
        </p>
      ) : null}
      {visible.length > 0 ? (
        <ul className="divide-y divide-zinc-100">
          {visible.map((row) => {
            const busy = busyId === row.id;
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px] sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900">
                    <span className="mr-2 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
                      {KIND_LABEL[row.kind]} · {REGION_LABEL[row.region] || row.region}
                    </span>
                    {[row.year, row.make, row.model].filter(Boolean).join(" ") || row.title}
                  </p>
                  <p className="mt-0.5 tabular-nums text-zinc-700">
                    Ставка {row.currency === "GBP" ? "£" : "$"}
                    {Math.round(row.bid || 0).toLocaleString("ru-RU")} → под ключ {usd(row.total_usd)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {showManager && row.manager_name ? `${row.manager_name} · ` : ""}
                    {new Date(row.updated_at).toLocaleDateString("ru-RU")}
                    {row.lot_url ? (
                      <>
                        {" · "}
                        <a href={row.lot_url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                          лот
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!row.bought ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void update(row, { on_home: !row.on_home })}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset disabled:opacity-50 ${
                        row.on_home
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
                      }`}
                    >
                      {row.on_home ? "На главной ✓" : "На главную"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void update(row, { bought: !row.bought })}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset disabled:opacity-50 ${
                      row.bought
                        ? "bg-emerald-600 text-white ring-emerald-600"
                        : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
                    }`}
                  >
                    {row.bought ? "Купили ✓" : "Купили"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(row)}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
