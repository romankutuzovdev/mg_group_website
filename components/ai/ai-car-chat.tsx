"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUp,
  ArrowUpRight,
  Crown,
  Fuel,
  Globe2,
  RotateCcw,
  Sparkles,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { LotImage } from "@/components/auctions/lot-image";
import { apiUrl } from "@/lib/api/config";
import { resolveLotImageUrl } from "@/lib/auctions/lot-image-url";
import { REGION_LABELS, type AuctionRegion } from "@/lib/auctions/types";
import { cn } from "@/lib/utils";

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
  /** Панель в первом экране: фиксированная высота, чтобы Hero не прыгал от ответов. */
  variant?: "default" | "hero";
};

// Search works by make, model, budget, year, region and fuel, not by body type,
// so templates name those: they are the requests the catalog can answer well.
const TEMPLATE_GROUPS = [
  {
    id: "popular",
    label: "Популярное",
    icon: Star,
    items: [
      "Toyota RAV4 от 2018 года",
      "Hyundai Tucson от 2018 года до $15 000",
      "BMW X5 до $25 000",
      "Tesla Model 3 до $20 000",
      "Toyota Camry от 2019 года на ходу",
      "Kia Sportage с автоматом до $15 000",
      "Volkswagen Tiguan от 2018 года",
      "Honda Accord от 2019 года до $15 000",
    ],
  },
  {
    id: "budget",
    label: "По бюджету",
    icon: Wallet,
    items: [
      "Что есть на ходу до $5 000",
      "До $10 000 с пробегом до 100 000 км",
      "До $15 000 не старше 2018 года",
      "До $25 000 не старше 2020 года",
      "Самые свежие машины до $30 000",
      "До $8 000 с автоматом, на ходу",
      "До $12 000 с пробегом до 80 000 км",
      "До $20 000 не старше 2021 года",
    ],
  },
  {
    id: "fuel",
    label: "Топливо и привод",
    icon: Fuel,
    items: [
      "Гибрид с небольшим пробегом",
      "Электромобиль до $20 000",
      "Дизель с автоматом до $15 000",
      "Полный привод до $15 000",
      "Гибрид Toyota от 2019 года",
      "Полный привод, на ходу, от 2018 года",
      "Электромобиль с пробегом до 50 000 км",
      "Механика до $10 000",
    ],
  },
  {
    id: "region",
    label: "По стране",
    icon: Globe2,
    items: [
      "Из Кореи до $15 000 с небольшим пробегом",
      "Из США не старше 2020 года до $20 000",
      "Из Англии дизель с автоматом",
      "Из Китая электромобиль от 2022 года",
      "Из Кореи гибрид",
      "Из США на ходу до $10 000",
      "Из Англии до $15 000 от 2018 года",
      "Из Китая до $25 000 с небольшим пробегом",
    ],
  },
  {
    id: "family",
    label: "Для семьи",
    icon: Users,
    items: [
      "Kia Carnival от 2018 года",
      "Hyundai Santa Fe до $20 000",
      "Honda CR-V от 2018 года",
      "Toyota Highlander до $25 000",
      "Toyota Sienna гибрид",
      "Skoda Kodiaq от 2018 года",
    ],
  },
  {
    id: "premium",
    label: "Премиум",
    icon: Crown,
    items: [
      "Mercedes E-Class от 2019 года",
      "BMW 5 Series до $30 000",
      "Audi Q5 от 2019 года",
      "Lexus RX гибрид",
      "Porsche Cayenne до $40 000",
      "Genesis G80 от 2020 года",
    ],
  },
] as const;

const LOT_TEMPLATES = [
  "Какие риски у этого лота?",
  "Что значат эти повреждения?",
  "На что смотреть перед ставкой?",
  "Покажи похожие варианты",
  "Покажи такие же, но дешевле",
  "Есть такие же с меньшим пробегом?",
];

const FOLLOW_UPS = ["Покажи дешевле", "Только на ходу", "С меньшим пробегом", "Только с автоматом"];

const CATALOGS = Object.values(REGION_LABELS);

const ERRORS: Record<string, string> = {
  rate_limited: "Слишком много вопросов подряд. Попробуйте через час.",
  daily_limit: "На сегодня лимит подбора исчерпан. Напишите менеджеру.",
};

/** **bold** only: the model writes it, and raw asterisks look broken. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

/** Paragraphs and lists from the model's light markdown. Text stays text: no HTML. */
function Reply({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { marker: string; text: string }[] = [];

  const flush = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={blocks.length} className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="shrink-0 font-medium text-emerald-400">{item.marker}</span>
            <span className="min-w-0">{inline(item.text)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (bullet) {
      list.push({ marker: "•", text: bullet[1] });
    } else if (numbered) {
      list.push({ marker: `${numbered[1]}.`, text: numbered[2] });
    } else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-2.5">{blocks}</div>;
}

function LotResult({ lot }: { lot: Card }) {
  const region = REGION_LABELS[lot.region as AuctionRegion];
  const facts = [
    lot.mileageKm ? `${lot.mileageKm.toLocaleString("ru-RU")} км` : null,
    lot.damage && lot.damage !== "—" ? lot.damage : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/auctions/${encodeURIComponent(lot.slug)}/`}
      prefetch={false}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] transition duration-200 hover:-translate-y-0.5 hover:border-emerald-400/50 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 motion-reduce:transform-none"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-white/5">
        <LotImage
          src={resolveLotImageUrl(lot.imageUrl)}
          alt={lot.title}
          fill
          tone="dark"
          className="object-cover transition duration-500 group-hover:scale-[1.04] motion-reduce:transform-none"
        />
        {region ? (
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white backdrop-blur-sm">
            {region}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="truncate text-sm font-medium text-white">{lot.title}</span>
        {facts.length > 0 ? (
          <span className="truncate text-xs text-text-on-dark-muted">{facts.join(" · ")}</span>
        ) : null}
        <span className="mt-auto flex items-center justify-between pt-1.5">
          <span className="font-display text-base font-semibold text-emerald-400">
            ~${lot.priceUsd.toLocaleString("ru-RU")}
          </span>
          <ArrowUpRight
            className="h-4 w-4 text-white/40 transition group-hover:text-emerald-400"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2.5 text-sm text-text-on-dark-muted" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 motion-reduce:animate-none"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      Проверяю все каталоги…
    </div>
  );
}

const chipClass =
  "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-emerald-400/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40";

export function AiCarChat({
  lotSlug,
  title = "Подбор авто с ИИ",
  intro = "Опишите бюджет и какая машина нужна. Проверю все каталоги сразу, а не только США.",
  variant = "default",
}: Props) {
  // Hero renders at once and hides only if the API says AI is off: no pop-in on first screen.
  const [enabled, setEnabled] = useState(variant === "hero");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string>(TEMPLATE_GROUPS[0].id);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/api/v1/ai/status"))
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => {
        if (!cancelled) setEnabled(Boolean(data.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const last = el.lastElementChild;
    if (variant === "hero" && !busy && last) {
      // Short panel: open the answer from its first line, not from the last card.
      el.scrollTop += last.getBoundingClientRect().top - el.getBoundingClientRect().top - 12;
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, variant]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  if (!enabled) return null;

  const ask = async (history: Message[]) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/v1/ai/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content: c }) => ({ role, content: c })),
          lot_slug: lotSlug ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[String(data.detail)] ?? "Подбор сейчас недоступен. Попробуйте позже.");
        return;
      }
      setMessages([...history, { role: "assistant", content: data.reply, lots: data.lots }]);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    void ask(next);
  };

  const reset = () => {
    setMessages([]);
    setError(null);
    setDraft("");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(draft);
    }
  };

  const started = messages.length > 0;
  const group = TEMPLATE_GROUPS.find((g) => g.id === groupId) ?? TEMPLATE_GROUPS[0];
  const isHero = variant === "hero";
  const allTemplates: readonly string[] = lotSlug ? LOT_TEMPLATES : group.items;
  const templates = isHero ? allTemplates.slice(0, 4) : allTemplates;
  const lastIsAnswer = messages[messages.length - 1]?.role === "assistant";

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border text-white",
        isHero
          ? "flex h-[35rem] flex-col border-white/15 bg-zinc-950/80 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)] backdrop-blur-xl lg:h-[32rem]"
          : "border-white/10 bg-bg-dark shadow-[0_24px_60px_-24px_rgba(12,10,9,0.55)]",
      )}
      aria-label={title}
    >
      <div
        className="pointer-events-none absolute -right-24 -top-32 -z-10 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl"
        aria-hidden
      />

      <header className="flex items-start gap-3 border-b border-white/10 p-5 sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 ring-1 ring-emerald-400/30">
          <Sparkles className="h-5 w-5 text-emerald-400" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          {isHero && started ? null : (
            <p className="mt-0.5 text-sm text-text-on-dark-muted">{intro}</p>
          )}
        </div>
        {started ? (
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Новый подбор</span>
            <span className="sr-only sm:hidden">Новый подбор</span>
          </button>
        ) : null}
      </header>

      {lotSlug || isHero ? null : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-5 py-2.5 text-xs text-text-on-dark-muted sm:px-6">
          <span className="font-medium text-white/80">Ищу по всем каталогам:</span>
          {CATALOGS.map((name) => (
            <span key={name} className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              {name}
            </span>
          ))}
        </div>
      )}

      {started ? (
        <div
          ref={logRef}
          className={cn(
            "space-y-5 overflow-y-auto p-5 sm:px-6",
            isHero ? "min-h-0 flex-1" : "max-h-[min(560px,65vh)]",
          )}
          aria-live="polite"
        >
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-emerald-400 px-3.5 py-2 text-sm font-medium text-zinc-950">
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={i} className="space-y-3">
                <div className="text-sm leading-relaxed text-white/85">
                  <Reply text={m.content} />
                </div>
                {m.lots && m.lots.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {m.lots.map((lot) => (
                      <li key={lot.slug} className="min-w-0">
                        <LotResult lot={lot} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ),
          )}
          {busy ? <Thinking /> : null}
        </div>
      ) : (
        <div className={cn("p-5 sm:px-6", isHero && "min-h-0 flex-1 overflow-y-auto")}>
          {lotSlug ? null : (
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-3">
              {TEMPLATE_GROUPS.map((g) => {
                const Icon = g.icon;
                const active = g.id === group.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGroupId(g.id)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                      active ? "bg-white/10 text-white" : "text-white/60 hover:text-white",
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", active && "text-emerald-400")} aria-hidden />
                    {g.label}
                  </button>
                );
              })}
            </div>
          )}
          <ul className={cn("grid grid-cols-1 gap-2", !isHero && "sm:grid-cols-2")}>
            {templates.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => send(text)}
                  className="group flex h-full min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-sm text-white/85 transition hover:border-emerald-400/50 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <span className="min-w-0">{text}</span>
                  <ArrowUpRight
                    className="h-4 w-4 shrink-0 text-white/30 transition group-hover:text-emerald-400"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-white/10 p-4 sm:px-6">
        {error ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <span className="min-w-0">{error}</span>
            {messages[messages.length - 1]?.role === "user" ? (
              <button
                type="button"
                onClick={() => void ask(messages)}
                disabled={busy}
                className="shrink-0 font-semibold text-white underline underline-offset-2 disabled:opacity-40"
              >
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}

        {lastIsAnswer && !busy ? (
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {FOLLOW_UPS.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => send(text)}
                className={cn(chipClass, "shrink-0")}
              >
                {text}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={submit}
          className="flex items-end gap-2 rounded-xl border border-white/15 bg-white/[0.05] p-1.5 transition focus-within:border-emerald-400/60"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={600}
            placeholder="Toyota RAV4 до $20 000"
            aria-label="Ваш вопрос"
            className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-base text-white outline-none placeholder:text-white/40 sm:text-sm"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Отправить"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-zinc-950 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:bg-white/10 disabled:text-white/40"
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
        </form>
        <p className="mt-2 text-[11px] leading-snug text-white/45">
          Ответы ИИ могут ошибаться. Цены это ориентир аукциона, а не итог под ключ.
        </p>
      </div>
    </section>
  );
}
