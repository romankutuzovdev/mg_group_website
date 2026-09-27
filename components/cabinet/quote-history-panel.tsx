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
    <section className="rounded-xl border border-border bg-white p-4 sm:p-5">
      <h2 className="text-sm font-semibold">
        {scope === "all" ? "Просчёты всех пользователей" : "Мои просчёты"}
      </h2>
      <p className="mt-1 text-xs text-text-muted">
        {scope === "all"
          ? "Каждый просчёт также приходит администраторам в Telegram."
          : "История ваших расчётов в калькуляторах."}
      </p>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {rows == null && !error ? <p className="mt-3 text-sm text-text-muted">Загрузка…</p> : null}
      {rows && rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Пока нет просчётов.</p>
      ) : null}
      {rows && rows.length > 0 ? (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-text-primary">
                  {KIND_LABEL[row.kind] || row.kind}
                  {row.title ? ` · ${row.title}` : ""}
                </span>
                <time className="text-xs text-text-muted">
                  {new Date(row.created_at).toLocaleString("ru-RU")}
                </time>
              </div>
              {scope === "all" ? (
                <p className="mt-0.5 text-xs text-text-secondary">{person(row)}</p>
              ) : null}
              {money(row) ? <p className="mt-0.5 text-text-secondary">{money(row)}</p> : null}
              {row.location ? <p className="mt-0.5 text-xs text-text-muted">{row.location}</p> : null}
              {row.summary ? <p className="mt-0.5 text-xs text-text-muted">{row.summary}</p> : null}
              {row.lot_url ? (
                <a
                  href={row.lot_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-xs text-accent-dark underline underline-offset-2"
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
