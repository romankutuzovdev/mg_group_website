"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CheckCheck, MessageCircle, Send, X } from "lucide-react";
import { apiUrl } from "@/lib/api/config";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: number;
};

const SESSION_KEY = "mg_support_session";
const SEEN_KEY = "mg_support_seen";
const READ_DELAY_MS = 2000;

function readStorage(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the chat still works until reload */
  }
}

function ensureSession(): string {
  let id = readStorage(SESSION_KEY);
  if (!/^[a-z0-9]{16,64}$/.test(id)) {
    id = crypto.randomUUID().replace(/-/g, "");
    writeStorage(SESSION_KEY, id);
  }
  return id;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function SupportChat({ appRoute = false }: { appRoute?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState(0);
  // User messages before this index show two ticks; the rest wait for the timer.
  const [readCount, setReadCount] = useState(Infinity);
  const readTimer = useRef<number | undefined>(undefined);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/v1/support/status"))
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => {
        if (cancelled || !data.enabled) return;
        setGreeting(String(data.greeting || ""));
        setSessionId(ensureSession());
        setSeen(Number(readStorage(SEEN_KEY)) || 0);
        setEnabled(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const pull = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(
        apiUrl(`/api/v1/support/messages?session_id=${encodeURIComponent(sessionId)}`),
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) setMessages(data.messages);
    } catch {
      /* next poll retries */
    }
  }, [sessionId]);

  // Fast while open; slower when closed, only to light up the unread badge.
  useEffect(() => {
    if (!enabled || !sessionId) return;
    void pull();
    const timer = window.setInterval(() => void pull(), open ? 3000 : 20000);
    return () => window.clearInterval(timer);
  }, [enabled, sessionId, open, pull]);

  useEffect(() => () => window.clearTimeout(readTimer.current), []);

  const lastAgentAt = messages.reduce(
    (max, m) => (m.role === "agent" && m.createdAt > max ? m.createdAt : max),
    0,
  );

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (lastAgentAt > seen) {
      setSeen(lastAgentAt);
      writeStorage(SEEN_KEY, String(lastAgentAt));
    }
  }, [open, messages, lastAgentAt, seen]);

  if (!enabled) return null;

  const unread = !open && lastAgentAt > seen;
  let userIndex = 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/v1/support/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          text,
          page: window.location.pathname.slice(0, 200),
        }),
      });
      if (res.status === 429) {
        setError("Слишком много сообщений. Подождите минуту.");
        return;
      }
      if (!res.ok) {
        setError("Не удалось отправить. Попробуйте ещё раз.");
        return;
      }
      setDraft("");
      const sentBefore = messages.filter((m) => m.role === "user").length;
      setReadCount((count) => Math.min(count, sentBefore));
      window.clearTimeout(readTimer.current);
      readTimer.current = window.setTimeout(() => setReadCount(Infinity), READ_DELAY_MS);
      await pull();
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const position = appRoute
    ? "bottom-4 right-4"
    : "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-4 lg:bottom-6 lg:right-6";

  return (
    <div className={cn("fixed z-[90]", position)}>
      {open ? (
        <section
          aria-label="Чат с менеджером"
          className="flex h-[min(520px,calc(100dvh-8rem))] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between gap-3 bg-zinc-950 px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Менеджер MG.GROUP</p>
              <p className="flex items-center gap-1.5 text-xs text-white/70">
                <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                В сети
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрыть чат"
              className="rounded-md p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-zinc-50 p-3" aria-live="polite">
            <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-zinc-800 shadow-sm">
              {greeting}
            </p>
            {messages.map((m) => {
              const read = m.role === "user" && userIndex++ < readCount;
              return m.role === "system" ? (
                <p key={m.id} className="px-2 text-center text-xs text-zinc-500">
                  {m.content}
                </p>
              ) : (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div
                    className={cn(
                      "inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      m.role === "user"
                        ? "rounded-br-sm bg-primary text-white"
                        : "rounded-bl-sm bg-white text-zinc-800",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p
                      className={cn(
                        "mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none",
                        m.role === "user" ? "text-white/75" : "text-zinc-400",
                      )}
                    >
                      {formatTime(m.createdAt)}
                      {m.role === "user" ? (
                        read ? (
                          <CheckCheck className="h-3.5 w-3.5" aria-label="Прочитано" />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-label="Отправлено" />
                        )
                      ) : null}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {error ? <p className="px-3 pt-2 text-xs text-red-600">{error}</p> : null}

          <form onSubmit={(e) => void submit(e)} className="flex gap-2 border-t border-border p-2.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              placeholder="Ваше сообщение"
              aria-label="Ваше сообщение"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Отправить"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Открыть чат с менеджером"
          className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:brightness-95"
        >
          <MessageCircle className="h-6 w-6" aria-hidden />
          {unread ? (
            <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
          ) : (
            <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-emerald-300 ring-2 ring-white" />
          )}
        </button>
      )}
    </div>
  );
}
