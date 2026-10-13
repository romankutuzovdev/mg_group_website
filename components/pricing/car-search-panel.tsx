"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createCarSearch,
  deleteCarSearch,
  fetchCarSearches,
  type CarSearch,
} from "@/lib/api/cabinet";

const REGIONS = [
  { value: "", label: "Все страны" },
  { value: "usa", label: "США" },
  { value: "uk", label: "Англия" },
  { value: "korea", label: "Корея" },
  { value: "china", label: "Китай" },
] as const;

function regionLabel(value: string) {
  return REGIONS.find((row) => row.value === value)?.label || "Все страны";
}

function searchTitle(row: CarSearch) {
  const car = [row.make, row.model].filter(Boolean).join(" ") || "Любая марка";
  const years =
    row.year_from || row.year_to
      ? `${row.year_from || "…"}–${row.year_to || "…"}`
      : "";
  const price = row.max_bid ? `до $${Math.round(row.max_bid).toLocaleString("ru-RU")}` : "";
  return [regionLabel(row.region), car, years, price].filter(Boolean).join(" · ");
}

export function CarSearchPanel() {
  const [rows, setRows] = useState<CarSearch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [region, setRegion] = useState("usa");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [maxBid, setMaxBid] = useState("");

  const load = useCallback(() => {
    return fetchCarSearches()
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Не удалось загрузить поиски");
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const created = await createCarSearch({
        region,
        make: make.trim(),
        model: model.trim(),
        year_from: yearFrom ? Number(yearFrom) : null,
        year_to: yearTo ? Number(yearTo) : null,
        max_bid: maxBid ? Number(maxBid) : null,
      });
      setMake("");
      setModel("");
      const found = created.catalog_count ?? 0;
      const sent = created.notified_now ?? 0;
      setNotice(
        found
          ? `В каталоге сейчас ${found.toLocaleString("ru-RU")}. В Telegram отправлено ${sent}. Новые лоты тоже придут вам.`
          : "Поиск сохранён. Когда такой лот появится, пришлём его вам в Telegram.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить поиск");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setError(null);
    try {
      await deleteCarSearch(id);
      setRows((prev) => (prev || []).filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить поиск");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-white p-4 sm:p-5">
      <h2 className="text-sm font-semibold">Поиск авто</h2>
      <p className="mt-1 text-xs text-text-muted">
        Запрос сохраняется за вашим Telegram. Новые лоты приходят только вам. Один раз откройте
        бота и нажмите Start, иначе Telegram не доставит сообщение.
      </p>

      <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Страна
          <select
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
          >
            {REGIONS.map((row) => (
              <option key={row.value || "all"} value={row.value}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Марка
          <input
            value={make}
            onChange={(event) => setMake(event.target.value)}
            placeholder="BMW"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Модель
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="X5"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Ставка до, USD
          <input
            type="number"
            min={0}
            value={maxBid}
            onChange={(event) => setMaxBid(event.target.value)}
            placeholder="15000"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Год от
          <input
            type="number"
            min={1980}
            max={2035}
            value={yearFrom}
            onChange={(event) => setYearFrom(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
          Год до
          <input
            type="number"
            min={1980}
            max={2035}
            value={yearTo}
            onChange={(event) => setYearTo(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Искать и присылать в Telegram"}
          </button>
        </div>
      </form>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm text-emerald-700">{notice}</p> : null}

      {rows && rows.length > 0 ? (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{searchTitle(row)}</span>
              <button
                type="button"
                onClick={() => void remove(row.id)}
                className="shrink-0 text-xs font-medium text-text-muted hover:text-red-600"
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
