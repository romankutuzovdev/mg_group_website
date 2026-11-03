"use client";

import { useEffect, useState } from "react";
import {
  fetchAllQuoteHistory,
  fetchMyQuoteHistory,
  type QuoteHistoryEntry,
  type QuoteHistoryKind,
} from "@/lib/api/cabinet";

const KIND_LABEL: Record<QuoteHistoryKind, string> = {
  usa: "США",
  uk: "Англия",
  restoration: "Восстановление",
  customs: "Растаможка",
};

function person(row: QuoteHistoryEntry) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  const handle = row.username ? `@${row.username}` : "";
  return [name, handle].filter(Boolean).join(" ") || `TG ${row.telegram_id}`;
}

function money(row: QuoteHistoryEntry) {
  const parts: string[] = [];
  if (row.bid) {
    parts.push(`${row.currency === "GBP" ? "£" : "$"}${Math.round(row.bid).toLocaleString("ru-RU")}`);
  }
  if (row.total_usd) {
    parts.push(`итого $${Math.round(row.total_usd).toLocaleString("en-US")}`);
  }
  return parts.join(" → ");
}

export function QuoteHistoryPanel({ scope }: { scope: "mine" | "all" }) {
  const [rows, setRows] = useState<QuoteHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = scope === "all" ? fetchAllQuoteHistory : fetchMyQuoteHistory;
    void load()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Не удалось загрузить историю");
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-zinc-900">
          {scope === "all" ? "Все просчёты" : "Мои просчёты"}
        </h2>
        {rows ? (
          <span className="text-xs tabular-nums text-zinc-500">{rows.length} записей</span>
        ) : null}
      </div>
      {error ? <p className="px-5 py-4 text-[13px] text-rose-700">{error}</p> : null}
      {rows == null && !error ? <p className="px-5 py-4 text-[13px] text-zinc-500">Загрузка…</p> : null}
      {rows && rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-zinc-500">Пока нет просчётов.</p>
      ) : null}
      {rows && rows.length > 0 ? (
        <ul className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3 text-[13px] sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-zinc-900">
                  <span className="mr-2 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
                    {KIND_LABEL[row.kind] || row.kind}
                  </span>
                  {row.title || ""}
                </span>
                <time className="text-xs tabular-nums text-zinc-500">
                  {new Date(row.created_at).toLocaleString("ru-RU")}
                </time>
              </div>
              {scope === "all" ? (
                <p className="mt-1 text-xs text-zinc-600">{person(row)}</p>
              ) : null}
              {money(row) ? <p className="mt-0.5 tabular-nums text-zinc-800">{money(row)}</p> : null}
              {row.location ? <p className="mt-0.5 text-xs text-zinc-500">{row.location}</p> : null}
              {row.summary ? <p className="mt-0.5 text-xs text-zinc-500">{row.summary}</p> : null}
              {row.lot_url ? (
                <a
                  href={row.lot_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-xs text-emerald-700 underline-offset-2 hover:underline"
                >
                  {row.lot_url}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
