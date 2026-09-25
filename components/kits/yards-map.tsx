"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";
import { AnchorButton } from "@/components/site/button";
import { consultationMessage } from "@/lib/company";
import { YARDS, yardById, type YardId } from "@/lib/kits/yards";

const WorldSeaMap = dynamic(
  () => import("./world-sea-map").then((mod) => mod.WorldSeaMap),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-black/50" aria-hidden />,
  },
);

export function YardsMap() {
  const reduceMotion = useReducedMotion();
  const chatRef = useRef<HTMLDivElement>(null);
  const [yardId, setYardId] = useState<YardId>("nj");
  const [visible, setVisible] = useState(1);
  const [wish, setWish] = useState("");

  const yard = yardById(yardId);
  const lines = reduceMotion ? yard.chat : yard.chat.slice(0, visible);

  useEffect(() => {
    if (reduceMotion) {
      setVisible(yard.chat.length);
      return;
    }
    setVisible(1);
    const timers = yard.chat.map((_, i) =>
      window.setTimeout(() => setVisible(i + 1), 640 * i),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [yard, reduceMotion]);

  useEffect(() => {
    const node = chatRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [lines.length, reduceMotion]);

  const tgHref = consultationMessage(
    [
      `Чат разборки MG.GROUP · ${yard.city}`,
      yard.place,
      wish.trim()
        ? `Пожелание на разборку: ${wish.trim()}`
        : "Хочу подключиться к эфиру разборки и видеть процесс в чате.",
    ].join("\n"),
  );

  return (
    <section id="razborki" className="yard-map relative scroll-mt-[5.5rem] overflow-hidden bg-bg-dark">
      <div className="bg-grid-dark pointer-events-none absolute inset-0 opacity-30" />
      <div className="bg-noise pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22c55e] to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#22c55e]">
            Аукцион США · Нью-Джерси · Техас · Лондон
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-text-on-dark md:text-4xl">
            Три разборки. Вы видите процесс в чате.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-on-dark-muted md:text-base">
            Лоты с аукционов США сходятся в Нью-Джерси или Техас: морем в Турцию, затем в Новороссийск и
            фурой на Гродно и Минск. Из Лондона груз идёт сушей через Францию — тоже в Гродно, потом в
            Минск. Пока идёт разборка, вы в чате: видите процесс и можете править бланк на подъёмнике.
          </p>
        </div>

        <div className="mt-8 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {YARDS.map((item) => {
            const active = item.id === yardId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setYardId(item.id)}
                className={`min-h-11 shrink-0 rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? "border-[#22c55e]/50 bg-[#22c55e]/15 text-text-on-dark"
                    : "border-white/10 bg-white/[0.03] text-text-on-dark-muted hover:border-[#22c55e]/30 hover:text-text-on-dark"
                }`}
              >
                <span className="block font-display text-[10px] tracking-[0.22em] text-[#22c55e]">
                  {item.code}
                </span>
                <span className="mt-1 block text-sm font-semibold">{item.city}</span>
                <span className="mt-0.5 block text-[11px] opacity-70">{item.place}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] xl:min-h-[36rem]">
          <div className="yard-viewport relative isolate min-h-[22rem] min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/40 sm:min-h-[28rem] xl:min-h-0 xl:h-full">
            <span className="kit-hud-corner kit-hud-tl" />
            <span className="kit-hud-corner kit-hud-tr" />
            <span className="kit-hud-corner kit-hud-bl" />
            <span className="kit-hud-corner kit-hud-br" />

            <WorldSeaMap activeId={yardId} onSelect={setYardId} />

            <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[94%] rounded-lg border border-white/10 bg-black/65 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-white/55">
              <span className="text-[#22c55e]">США</span> море · Турция → Новороссийск
              <span className="mx-2 text-white/25">·</span>
              <span className="text-[#22c55e]">Лондон</span> суша · Франция → Гродно → Минск
            </div>
          </div>

          <aside className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-text-on-dark sm:p-6 xl:min-h-0 xl:h-full">
            <div className="flex shrink-0 items-start justify-between gap-3">
              <div>
                <p className="font-display text-[10px] tracking-[0.24em] text-[#22c55e]">{yard.code}</p>
                <h3 className="mt-1 font-display text-xl font-semibold">{yard.headline}</h3>
                <p className="mt-1 text-sm text-text-on-dark-muted">
                  {yard.city} · {yard.place}
                </p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#22c55e]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                </span>
                эфир
              </span>
            </div>
            <p className="mt-4 shrink-0 text-sm leading-relaxed text-text-on-dark-muted">{yard.body}</p>
            <p className="mt-3 shrink-0 text-[11px] uppercase tracking-[0.16em] text-[#22c55e]/80">
              {yard.seaLabel}
            </p>

            <div
              ref={chatRef}
              className="yard-chat mt-5 min-h-[10rem] flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1"
              aria-live="polite"
            >
              {lines.map((line, i) => (
                <div
                  key={`${yard.id}-${i}`}
                  className={`yard-bubble max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    line.role === "client" ? "ml-auto yard-bubble-client" : "yard-bubble-yard"
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-[0.16em] opacity-55">
                    {line.role === "client" ? "Вы" : "Разборка"}
                    {line.tag ? ` · ${line.tag}` : ""}
                  </p>
                  <p className="mt-0.5">{line.text}</p>
                </div>
              ))}
              {visible < yard.chat.length && !reduceMotion ? (
                <p className="px-1 text-[11px] text-white/35">печатает…</p>
              ) : null}
            </div>

            <form
              className="mt-4 flex shrink-0 flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                window.open(tgHref, "_blank", "noopener,noreferrer");
              }}
            >
              <label className="block text-[11px] uppercase tracking-[0.18em] text-white/40">
                Пожелание на разборку
                <input
                  value={wish}
                  onChange={(e) => setWish(e.target.value)}
                  placeholder="Например: оставьте оптику в сборе"
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-text-on-dark outline-none placeholder:text-white/25 focus:border-[#22c55e]/50"
                />
              </label>
              <AnchorButton href={tgHref} target="_blank" rel="noopener noreferrer" className="w-full">
                Открыть чат разборки
              </AnchorButton>
            </form>
          </aside>
        </div>
      </div>
    </section>
  );
}
