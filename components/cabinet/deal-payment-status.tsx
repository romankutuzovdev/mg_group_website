"use client";

import { useState } from "react";
import type { Deal } from "@/lib/api/cabinet";
import { adminUpdatePayment } from "@/lib/api/cabinet";

type Props = {
  deal: Deal;
  isAdmin?: boolean;
  onUpdated?: (deal: Deal) => void;
};

function formatAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DealPaymentStatus({ deal, isAdmin = false, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stage1 = Boolean(deal.payment_stage1_paid);
  const stage2 = Boolean(deal.payment_stage2_paid);
  const doneCount = (stage1 ? 1 : 0) + (stage2 ? 1 : 0);

  const setStage = (stage: 1 | 2, paid: boolean) => {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const next = await adminUpdatePayment(deal.id, { stage, paid });
        onUpdated?.(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось обновить оплату");
      } finally {
        setBusy(false);
      }
    })();
  };

  const rows: {
    stage: 1 | 2;
    label: string;
    hint: string;
    paid: boolean;
    at: string | null | undefined;
    canClose: boolean;
  }[] = [
    {
      stage: 1,
      label: "Этап 1",
      hint: "Первый платёж",
      paid: stage1,
      at: deal.payment_stage1_at,
      canClose: true,
    },
    {
      stage: 2,
      label: "Этап 2",
      hint: "Второй платёж",
      paid: stage2,
      at: deal.payment_stage2_at,
      canClose: stage1,
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Оплата</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {doneCount === 2
              ? "Оба этапа оплаты закрыты"
              : doneCount === 1
                ? "Закрыт 1 из 2 этапов"
                : "Ожидает оплаты"}
          </p>
        </div>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          {doneCount}/2
        </span>
      </div>

      <ol className="mt-3 space-y-2">
        {rows.map((row) => (
          <li
            key={row.stage}
            className={[
              "flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
              row.paid
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-border bg-zinc-50/50",
            ].join(" ")}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={[
                  "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  row.paid
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-200 text-zinc-600",
                ].join(" ")}
              >
                {row.paid ? "✓" : row.stage}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{row.label}</p>
                <p className="text-xs text-text-muted">
                  {row.paid
                    ? `Закрыт${formatAt(row.at) ? ` · ${formatAt(row.at)}` : ""}`
                    : row.canClose
                      ? row.hint
                      : "Сначала закройте этап 1"}
                </p>
              </div>
            </div>

            {isAdmin ? (
              <div className="flex flex-wrap gap-1.5 sm:shrink-0">
                {row.paid ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStage(row.stage, false)}
                    className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 sm:min-h-0"
                  >
                    Снять отметку
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !row.canClose}
                    onClick={() => setStage(row.stage, true)}
                    className="min-h-10 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 sm:min-h-0"
                  >
                    Этап закрыт
                  </button>
                )}
              </div>
            ) : (
              <span
                className={[
                  "self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:self-center",
                  row.paid
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-zinc-200 text-zinc-600",
                ].join(" ")}
              >
                {row.paid ? "Оплачено" : "Ожидает"}
              </span>
            )}
          </li>
        ))}
      </ol>

      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function paymentProgressLabel(deal: Deal): string | null {
  const a = Boolean(deal.payment_stage1_paid);
  const b = Boolean(deal.payment_stage2_paid);
  if (a && b) return "оплата закрыта";
  if (a) return "оплата 1/2";
  if (b) return "оплата 2/2";
  return null;
}
