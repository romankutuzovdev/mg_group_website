"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, Share2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/cabinet/ui";
import { createSharedQuote } from "@/lib/api/cabinet";
import { ApiError } from "@/lib/api/client";
import { copyText } from "@/lib/clipboard";
import { formatQuoteText, type QuoteSnapshot, type SharedQuote } from "@/lib/pricing/share-quote";

export function quoteShareUrl(id: string): string {
  return `${window.location.origin}/quote/?id=${encodeURIComponent(id)}`;
}

export function QuoteShareActions({ quote, sharedQuote }: {
  quote: QuoteSnapshot | null;
  sharedQuote?: SharedQuote;
}) {
  const key = JSON.stringify(quote);
  const latest = useRef(key);
  latest.current = key;
  const mounted = useRef(true);
  const [saved, setSaved] = useState<{ key: string; result: SharedQuote } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; text: string; error?: boolean; loginRequired?: boolean } | null>(null);
  const [manual, setManual] = useState<{ key: string; text: string } | null>(null);
  const active = sharedQuote || (saved?.key === key ? saved.result : null);
  const busy = working === key;
  const current = () => mounted.current && latest.current === key;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const copyQuote = async () => {
    if (!quote) return;
    const text = formatQuoteText(quote, active ? quoteShareUrl(active.id) : window.location.origin);
    try {
      await copyText(text);
      if (current()) {
        setManual(null);
        setFeedback({ key, text: "Просчёт скопирован." });
      }
    } catch {
      if (current()) {
        setManual({ key, text });
        setFeedback({ key, text: "Не удалось скопировать автоматически. Выделите текст ниже и скопируйте вручную.", error: true });
      }
    }
  };

  const share = async () => {
    if (!quote || busy) return;
    setWorking(key);
    setFeedback(null);
    try {
      const result = active || await createSharedQuote(quote);
      if (!current()) return;
      setSaved({ key, result });
      const url = quoteShareUrl(result.id);
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: `${quote.title} · MG.GROUP`, text: "Просчёт MG.GROUP", url });
          if (current()) setFeedback({ key, text: "Просчёт отправлен." });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            if (current()) setFeedback({ key, text: "Ссылка на просчёт готова." });
            return;
          }
          // Some browsers lose share permission while the link is being saved.
        }
      }
      await copyText(url);
      if (current()) setFeedback({ key, text: "Ссылка на просчёт скопирована." });
    } catch (err) {
      if (current()) setFeedback({
        key, error: true, loginRequired: err instanceof ApiError && err.status === 401,
        text: err instanceof ApiError && err.status === 401
          ? "Войдите в кабинет, чтобы создать ссылку на просчёт."
          : err instanceof Error ? err.message : "Не удалось поделиться просчётом. Повторите попытку.",
      });
    } finally {
      setWorking((value) => value === key ? null : value);
    }
  };

  if (!quote) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" className="min-h-11" disabled={busy} onClick={() => void share()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
          {busy ? "Готовим ссылку…" : "Поделиться просчётом"}
        </Button>
        <Button className="min-h-11" disabled={busy} onClick={() => void copyQuote()}>
          <Copy className="h-4 w-4" aria-hidden="true" /> Скопировать просчёт
        </Button>
      </div>
      {feedback?.key === key ? (
        <p role={feedback.error ? "alert" : "status"} className={`text-xs ${feedback.error ? "text-rose-700" : "text-emerald-700"}`}>
          {feedback.text}
          {feedback.loginRequired ? <Link href="/cabinet/" className="ml-1 font-medium underline">Войти в кабинет</Link> : null}
        </p>
      ) : null}
      {active ? (
        <label className="block text-xs text-text-secondary">
          Ссылка для получателя — откроется без входа
          <input
            aria-label="Ссылка на просчёт"
            readOnly
            value={quoteShareUrl(active.id)}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary"
          />
        </label>
      ) : null}
      {manual?.key === key ? (
        <textarea
          aria-label="Текст просчёта для копирования" readOnly rows={10} value={manual.text}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text-primary"
        />
      ) : null}
    </div>
  );
}
