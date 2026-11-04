"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Send, Sparkles } from "lucide-react";
import { apiUrl } from "@/lib/api/config";
import { resolveLotImageUrl } from "@/lib/auctions/lot-image-url";

type Card = {
  slug: string;
  title: string;
  imageUrl: string;
  region: string;
  priceUsd: number;
  mileageKm: number | null;
  damage: string;
};

type Message = { role: "user" | "assistant"; content: string; lots?: Card[] };

type Props = {
  /** Лот, который сейчас открыт: ИИ отвечает с учётом его данных. */
  lotSlug?: string;
  title?: string;
  intro?: string;
};

const SUGGESTIONS = [
  "Кроссовер на автомате до $15 000",
  "Седан для семьи, не старше 2018 года",
  "Гибрид с небольшим пробегом",
];

const ERRORS: Record<string, string> = {
  rate_limited: "Слишком много вопросов подряд. Попробуйте через час.",
  daily_limit: "На сегодня лимит подбора исчерпан. Напишите менеджеру.",
};

export function AiCarChat({
  lotSlug,
  title = "Подбор авто с ИИ",
  intro = "Опишите бюджет и какая машина нужна. Подберу живые лоты из каталога.",
}: Props) {
  const [enabled, setEnabled] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/v1/ai/status"))
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => {
        if (!cancelled) setEnabled(Boolean(data.enabled));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  if (!enabled) return null;

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/v1/ai/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content: c }) => ({ role, content: c })),
          lot_slug: lotSlug ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[String(data.detail)] ?? "Подбор сейчас недоступен. Попробуйте позже.");
        return;
      }
      setMessages([...next, { role: "assistant", content: data.reply, lots: data.lots }]);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  return (
    <section className="card-premium rounded-xl p-5 sm:p-6" aria-label={title}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-text-secondary">{intro}</p>

      {messages.length > 0 ? (
        <div ref={logRef} className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl bg-zinc-900 px-3.5 py-2 text-sm text-white"
                    : "text-sm leading-relaxed text-text-primary"
                }
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
              {m.lots && m.lots.length > 0 ? (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {m.lots.map((lot) => (
                    <li key={lot.slug}>
                      <Link
                        href={`/auctions/${lot.slug}/`}
                        className="flex gap-3 rounded-lg border border-border bg-white p-2 transition hover:border-primary/60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveLotImageUrl(lot.imageUrl)}
                          alt=""
                          loading="lazy"
                          className="h-14 w-20 shrink-0 rounded-md bg-zinc-100 object-cover"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{lot.title}</span>
                          <span className="block text-xs text-text-muted">
                            ~${lot.priceUsd.toLocaleString("ru-RU")}
                            {lot.mileageKm ? ` · ${lot.mileageKm.toLocaleString("ru-RU")} км` : ""}
                          </span>
                          {lot.damage ? (
                            <span className="block truncate text-xs text-text-muted">{lot.damage}</span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {busy ? <p className="text-sm text-text-muted">Подбираю…</p> : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-primary/60"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={600}
          placeholder="Например: кроссовер до $15 000"
          aria-label="Ваш вопрос"
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Отправить"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
      <p className="mt-2 text-[11px] text-text-muted">
        Ответы ИИ могут ошибаться. Цены это ориентир аукциона, а не итог под ключ.
      </p>
    </section>
  );
}
