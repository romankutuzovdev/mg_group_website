"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  adminCreatePurchasedCar,
  adminDeletePurchasedCar,
  adminListPurchasedCars,
  adminUploadPurchasedCarPhoto,
  type PurchasedWholeCarAdmin,
} from "@/lib/api/cabinet";

const emptyForm = {
  year: new Date().getFullYear(),
  make: "",
  model: "",
  trim: "",
  image_url: "",
  source: "Copart",
  region: "США" as "США" | "Англия",
  purchased_at: "",
  damage: "",
  odometer: "",
  auction_price: 0,
  delivery: 0,
  dismantle: 0,
  market_by: 0,
  currency: "USD" as "USD" | "GBP",
  href: "",
  note: "",
  published: true,
};

export function PurchasedCarsAdmin() {
  const [items, setItems] = useState<PurchasedWholeCarAdmin[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await adminListPurchasedCars();
    setItems(list);
  }, []);

  useEffect(() => {
    void reload().catch((err) => {
      setError(err instanceof Error ? err.message : "Не удалось загрузить список");
    });
  }, [reload]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const car = await adminCreatePurchasedCar({
        year: Number(form.year),
        make: form.make.trim(),
        model: form.model.trim(),
        trim: form.trim.trim(),
        image_url: form.image_url.trim(),
        source: form.source.trim() || "Copart",
        region: form.region,
        purchased_at: form.purchased_at.trim(),
        damage: form.damage.trim(),
        odometer: form.odometer.trim(),
        auction_price: Number(form.auction_price) || 0,
        delivery: Number(form.delivery) || 0,
        dismantle: Number(form.dismantle) || 0,
        market_by: Number(form.market_by) || 0,
        currency: form.currency,
        href: form.href.trim(),
        note: form.note.trim(),
        published: form.published,
      });
      if (photo) {
        await adminUploadPurchasedCarPhoto(car.id, photo);
      }
      setForm(emptyForm);
      setPhoto(null);
      setOk("Авто добавлено и появится на /kuplennye-avto/");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Удалить это авто с витрины?")) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeletePurchasedCar(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  };

  const field = (
    label: string,
    key: keyof typeof emptyForm,
    opts?: { type?: string; step?: string },
  ) => (
    <label className="block text-xs font-medium text-text-secondary">
      {label}
      <input
        type={opts?.type || "text"}
        step={opts?.step}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        value={String(form[key] ?? "")}
        onChange={(e) => {
          const raw = e.target.value;
          if (opts?.type === "number") {
            setForm((f) => ({ ...f, [key]: raw === "" ? 0 : Number(raw) }));
          } else {
            setForm((f) => ({ ...f, [key]: raw }));
          }
        }}
      />
    </label>
  );

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold">Купленные авто (витрина)</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Добавляйте целые авто — они публикуются на странице{" "}
        <a href="/kuplennye-avto/" className="text-accent-dark underline underline-offset-2">
          /kuplennye-avto/
        </a>
        . Машинокомплекты сюда не входят.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {ok}
        </p>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("Год", "year", { type: "number" })}
        {field("Марка", "make")}
        {field("Модель", "model")}
        {field("Комплектация", "trim")}
        {field("Источник", "source")}
        <label className="block text-xs font-medium text-text-secondary">
          Регион
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={form.region}
            onChange={(e) =>
              setForm((f) => ({ ...f, region: e.target.value as "США" | "Англия" }))
            }
          >
            <option value="США">США</option>
            <option value="Англия">Англия</option>
          </select>
        </label>
        {field("Когда купили", "purchased_at")}
        {field("Повреждение", "damage")}
        {field("Пробег", "odometer")}
        {field("Аукцион $", "auction_price", { type: "number", step: "1" })}
        {field("Доставка $", "delivery", { type: "number", step: "1" })}
        {field("Рынок РБ $", "market_by", { type: "number", step: "1" })}
        <label className="block text-xs font-medium text-text-secondary">
          Валюта
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={form.currency}
            onChange={(e) =>
              setForm((f) => ({ ...f, currency: e.target.value as "USD" | "GBP" }))
            }
          >
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
          </select>
        </label>
        {field("URL фото (опционально)", "image_url")}
        {field("Ссылка", "href")}
        <label className="block text-xs font-medium text-text-secondary sm:col-span-2">
          Заметка
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </label>
        <label className="block text-xs font-medium text-text-secondary sm:col-span-2">
          Фото с диска
          <input
            type="file"
            accept="image/*"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
          />
          Опубликовать сразу
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={busy || !form.make.trim() || !form.model.trim()}
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {busy ? "Сохранение…" : "Добавить авто"}
          </button>
        </div>
      </form>

      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-sm font-semibold">Уже на витрине ({items.length})</h3>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Пока пусто.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((car) => (
              <li
                key={car.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {car.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={car.image} alt="" className="h-12 w-16 rounded object-cover" />
                  ) : (
                    <div className="h-12 w-16 rounded bg-zinc-100" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {car.year} {car.make} {car.model}
                      {!car.published ? " (черновик)" : ""}
                    </p>
                    <p className="text-xs text-text-muted">
                      {car.source} · {car.region} · под ключ {car.totalCost} {car.currency}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete(car.id)}
                  className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
