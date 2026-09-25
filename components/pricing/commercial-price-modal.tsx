"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CommercialOrigin } from "@/lib/pricing/commercial";
import {
  COMMERCIAL_TERMS,
  COMMERCIAL_UPDATED,
  DISMANTLE_TARIFFS,
  EXTRA_SERVICES,
  PRICING_FORMULA,
  USA_DISPATCHING_USD,
  USA_INLAND_DELIVERY,
  USA_VOLUME_DISCOUNTS,
  WEIGHT_FORMULA,
} from "@/lib/pricing/commercial";

type Props = {
  origin: CommercialOrigin;
  onClose: () => void;
};

const TITLES: Record<CommercialOrigin, string> = {
  uk: "Коммерческий прайс — Англия",
  usa: "Коммерческий прайс — США",
};

export function CommercialPriceModal({ origin, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const weight = WEIGHT_FORMULA[origin];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-label={TITLES[origin]}
      className="fixed inset-0 z-[100] m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-full w-full items-end justify-center sm:items-center sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-bg-base shadow-2xl sm:max-h-[88vh] sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative border-b border-border bg-bg-elevated px-5 py-4 sm:px-8 sm:py-5">
            <div className="absolute inset-x-0 top-2 flex justify-center sm:hidden">
              <span className="h-1 w-10 rounded-full bg-border" />
            </div>
            <div className="flex items-start justify-between gap-4 pt-3 sm:pt-0">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">
                  {origin === "uk" ? "Copart UK" : "Copart / IAAI USA"} · от {COMMERCIAL_UPDATED}
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold sm:text-2xl">{TITLES[origin]}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-text-muted transition hover:bg-bg-base hover:text-text-primary"
                aria-label="Закрыть"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-8 overflow-y-auto px-5 py-6 sm:px-8">
            <section className="rounded-2xl border border-accent/25 bg-accent/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Расчёт по весу</p>
              <p className="mt-2 font-display text-2xl font-semibold text-accent-dark">
                {weight.base.toLocaleString("ru-RU")} USD + {weight.perKg} USD × кг
              </p>
              <p className="mt-2 text-sm text-text-secondary">{weight.hint}</p>
            </section>

            <section>
              <h3 className="font-display text-lg font-semibold">Тарифы разбора до Минска</h3>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {DISMANTLE_TARIFFS[origin].map((row, i) => (
                      <tr key={row.id} className={i % 2 ? "bg-bg-elevated/60" : ""}>
                        <td className="px-4 py-3 text-text-secondary">{row.label}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {row.price.toLocaleString("ru-RU")} USD
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="font-display text-lg font-semibold">Формула цены</h3>
              <ol className="mt-3 space-y-2 text-sm text-text-secondary">
                {PRICING_FORMULA.map((line, i) => (
                  <li key={line} className="flex gap-3">
                    <span className="font-semibold text-accent">{i + 1}.</span>
                    {line}
                    {i === 1 && origin === "usa" ? ` + ${USA_DISPATCHING_USD} USD диспетчинг` : null}
                  </li>
                ))}
              </ol>
            </section>

            {origin === "usa" ? (
              <>
                <section>
                  <h3 className="font-display text-lg font-semibold">Доставка легкового авто по США</h3>
                  <div className="mt-4 overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <tbody>
                        {USA_INLAND_DELIVERY.map((row, i) => (
                          <tr key={row.miles} className={i % 2 ? "bg-bg-elevated/60" : ""}>
                            <td className="px-4 py-2.5 text-text-secondary">{row.miles} миль</td>
                            <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                              {row.price.toLocaleString("ru-RU")} USD
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="rounded-xl border border-border bg-bg-elevated p-4">
                  <h3 className="font-display text-base font-semibold">Скидки на объём</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-text-secondary">
                    {USA_VOLUME_DISCOUNTS.map((line) => (
                      <li key={line}>— {line}</li>
                    ))}
                  </ul>
                </section>
              </>
            ) : null}

            <section>
              <h3 className="font-display text-lg font-semibold">Дополнительные услуги</h3>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-bg-elevated text-left text-xs uppercase tracking-wide text-text-muted">
                    <tr>
                      <th className="px-4 py-2.5">Услуга</th>
                      <th className="px-4 py-2.5 text-right">Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EXTRA_SERVICES.filter((s) => (origin === "uk" ? s.uk : s.usa)).map((row, i) => (
                      <tr key={row.name} className={i % 2 ? "bg-bg-elevated/40" : ""}>
                        <td className="px-4 py-2.5 text-text-secondary">{row.name}</td>
                        <td className="px-4 py-2.5 text-right text-text-primary">
                          {origin === "uk" ? row.uk : row.usa}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {origin === "usa" ? (
                <p className="mt-3 text-xs text-text-muted">
                  В стоимость доп. услуг включено: рез, доставка, растаможка, место в контейнере. Стёкла и панорама —
                  без гарантий.
                </p>
              ) : null}
            </section>

            <section>
              <h3 className="font-display text-lg font-semibold">Условия</h3>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                {COMMERCIAL_TERMS.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-accent">—</span>
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
