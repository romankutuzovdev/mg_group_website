"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { AnchorButton, Button } from "@/components/site/button";
import { consultationMessage } from "@/lib/company";
import {
  EXPLODE_CAR,
  EXPLODE_PARTS,
  explodeTransform,
  type ExplodePart,
} from "@/lib/explode/parts";
import {
  CONTAINER_CAPACITY,
  KIT_SCHEMES,
  ORIGINS,
  PART_GROUPS,
  PART_META,
  blankDiff,
  kitsPerContainer,
  schemeById,
  volumeOf,
  type KitOrigin,
  type KitSchemeId,
} from "@/lib/kits/blank";

const TOTAL_PARTS = EXPLODE_PARTS.length;

function partLabel(id: string) {
  return PART_META[id]?.label ?? id;
}

export function KitConfigurator() {
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [schemeId, setSchemeId] = useState<KitSchemeId>("mishk");
  const [included, setIncluded] = useState<Set<string>>(() => new Set(KIT_SCHEMES[0].parts));
  const [hovered, setHovered] = useState<string | null>(null);
  const [explode, setExplode] = useState(reduceMotion ? 1 : 0);
  const explodeSpring = useSpring(reduceMotion ? 1 : 0, { stiffness: 28, damping: 18 });
  const [k, setK] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [donor, setDonor] = useState("");
  const [origin, setOrigin] = useState<KitOrigin>("usa");
  const [pulse, setPulse] = useState<{ id: string; kind: "in" | "out" } | null>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const tiltX = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 90, damping: 22 });
  const tiltY = useSpring(useTransform(mx, [-0.5, 0.5], [-12, 12]), { stiffness: 90, damping: 22 });

  const scheme = schemeById(schemeId);
  const includedList = useMemo(() => EXPLODE_PARTS.filter((p) => included.has(p.id)), [included]);
  const diff = useMemo(() => blankDiff(scheme.parts, included), [scheme.parts, included]);
  const fillPct = Math.round((included.size / TOTAL_PARTS) * 100);
  const perContainer = kitsPerContainer(included);
  const volume = volumeOf(included);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const sync = () => setK(el.offsetWidth / 920);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useMotionValueEvent(explodeSpring, "change", (v) => setExplode(v));

  useEffect(() => {
    explodeSpring.set(1);
  }, [explodeSpring]);

  function applyScheme(id: KitSchemeId) {
    setSchemeId(id);
    setIncluded(new Set(schemeById(id).parts));
    setScanning(true);
    window.setTimeout(() => setScanning(false), 900);
  }

  function togglePart(id: string) {
    const adding = !included.has(id);
    setIncluded((prev) => {
      const next = new Set(prev);
      if (adding) next.add(id);
      else next.delete(id);
      return next;
    });
    if (!reduceMotion) {
      setPulse({ id, kind: adding ? "in" : "out" });
      window.setTimeout(() => setPulse((p) => (p?.id === id ? null : p)), 580);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduceMotion || e.pointerType !== "mouse" || hovered) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function onPointerLeave() {
    mx.set(0);
    my.set(0);
    setHovered(null);
  }

  const tgHref = consultationMessage(
    [
      "Цифровой бланк разборки MG.GROUP",
      `Схема: ${scheme.title} (${scheme.code})`,
      `Рынок: ${origin === "usa" ? "США" : "Англия"}`,
      `Донор: ${donor.trim() || "подберёте вы"}`,
      `Позиций: ${included.size} из ${TOTAL_PARTS}`,
      "",
      "В бланке:",
      ...includedList.map((p) => `• ${partLabel(p.id)}`),
      ...(diff.removed.length
        ? ["", "Исключено из схемы:", ...diff.removed.map((id) => `• ${partLabel(id)}`)]
        : []),
      ...(diff.added.length
        ? ["", "Добавлено сверх схемы:", ...diff.added.map((id) => `• ${partLabel(id)}`)]
        : []),
    ].join("\n"),
  );

  const hoverPart = hovered ? EXPLODE_PARTS.find((p) => p.id === hovered) : null;

  return (
    <section id="blank" className="kit-blank relative scroll-mt-[5.5rem] overflow-hidden bg-bg-dark">
      <div className="bg-grid-dark pointer-events-none absolute inset-0 opacity-30" />
      <div className="bg-noise pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-text-on-dark md:text-4xl">
              Цифровой бланк разборки
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-on-dark-muted md:text-base">
              Выберите схему, кликните по узлам на доноре — бланк собирается в реальном времени.
              Это тот же документ, с которым работает разборка: МШК, полукомплект, ноускат или ДВС,
              плюс любые исключения и допы.
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/40">
            Клик по детали · вкл / выкл
          </p>
        </div>

        <div className="mt-8 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {KIT_SCHEMES.map((item) => {
            const active = item.id === schemeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => applyScheme(item.id)}
                className={`kit-scheme min-h-11 shrink-0 rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? "border-accent/50 bg-accent/15 text-text-on-dark"
                    : "border-white/10 bg-white/[0.03] text-text-on-dark-muted hover:border-accent/30 hover:text-text-on-dark"
                }`}
              >
                <span className="block font-display text-[10px] tracking-[0.22em] text-accent">
                  {item.code}
                </span>
                <span className="mt-1 block text-sm font-semibold">{item.title}</span>
                <span className="mt-0.5 block text-[11px] opacity-70">{item.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div
            className="kit-viewport relative overflow-x-clip rounded-2xl border border-white/10 bg-black/40"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
          >
            <span className="kit-hud-corner kit-hud-tl" />
            <span className="kit-hud-corner kit-hud-tr" />
            <span className="kit-hud-corner kit-hud-bl" />
            <span className="kit-hud-corner kit-hud-br" />
            {scanning ? <span className="kit-scan" aria-hidden /> : null}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(34,197,94,0.16) 0%, transparent 68%)",
              }}
              aria-hidden
            />

            <div className="pointer-events-none absolute left-4 top-4 z-20 hidden text-[10px] uppercase tracking-[0.2em] text-white/45 sm:block">
              Donor · {origin === "usa" ? "USA" : "UK"} · {scheme.code}
            </div>
            <div className="pointer-events-none absolute right-4 top-4 z-20 hidden text-right font-display text-xs text-accent sm:block">
              {fillPct}% донора
            </div>

            <motion.div
              className="relative px-2 py-16 sm:px-8 sm:py-20"
              style={
                reduceMotion
                  ? undefined
                  : { rotateX: tiltX, rotateY: tiltY, transformPerspective: 1400 }
              }
            >
              <div
                ref={stageRef}
                className="explode-stage relative mx-auto w-full max-w-4xl"
                aria-label="Интерактивный бланк разборки автомобиля"
              >
                <div className="explode-shadow" aria-hidden />

                {EXPLODE_PARTS.map((part) => {
                  const on = included.has(part.id);
                  const pulsing = pulse?.id === part.id ? pulse.kind : null;
                  return (
                    <button
                      key={part.id}
                      type="button"
                      data-in={on ? "1" : "0"}
                      data-focus={hovered === part.id ? "1" : "0"}
                      data-pulse={pulsing ?? undefined}
                      className="explode-item kit-part"
                      style={{
                        left: `${part.left}%`,
                        top: `${part.top}%`,
                        width: `${part.w}%`,
                        height: `${part.h}%`,
                        zIndex: pulsing || hovered === part.id ? 40 : part.z,
                        transform: explodeTransform(explode, part, k),
                        ["--fly-x" as string]: `${part.x * 0.35 * k}px`,
                        ["--fly-y" as string]: `${part.y * 0.35 * k}px`,
                      }}
                      aria-pressed={on}
                      aria-label={`${partLabel(part.id)}: ${on ? "в бланке" : "исключено"}`}
                      onMouseEnter={() => setHovered(part.id)}
                      onMouseLeave={() => setHovered((h) => (h === part.id ? null : h))}
                      onFocus={() => setHovered(part.id)}
                      onBlur={() => setHovered((h) => (h === part.id ? null : h))}
                      onClick={() => togglePart(part.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={part.src} alt="" draggable={false} loading="lazy" decoding="async" />
                    </button>
                  );
                })}

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="explode-car"
                  src={EXPLODE_CAR}
                  alt=""
                  draggable={false}
                  style={{ opacity: Math.max(0, 1 - explode / 0.42) }}
                />
              </div>
            </motion.div>

            {hoverPart ? <HoverChip part={hoverPart} on={included.has(hoverPart.id)} /> : null}

            <p className="relative z-10 px-4 pb-5 text-center text-[11px] text-white/40 sm:hidden">
              Нажмите на узел, чтобы добавить или убрать его из бланка
            </p>
          </div>

          <aside className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-text-on-dark sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-[10px] tracking-[0.24em] text-accent">{scheme.code}</p>
                <h3 className="mt-1 font-display text-xl font-semibold">{scheme.title}</h3>
              </div>
              <Ring value={fillPct} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-text-on-dark-muted">{scheme.description}</p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {ORIGINS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOrigin(item.id)}
                  className={`min-h-11 rounded-lg border text-sm transition ${
                    origin === item.id
                      ? "border-accent/50 bg-accent/15"
                      : "border-white/10 text-text-on-dark-muted hover:border-white/25"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="mt-3 block text-[11px] uppercase tracking-[0.18em] text-white/40">
              Донор (необязательно)
              <input
                value={donor}
                onChange={(e) => setDonor(e.target.value)}
                placeholder="Например: BMW 530d G30"
                className="mt-1.5 min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-text-on-dark outline-none placeholder:text-white/25 focus:border-accent/50"
              />
            </label>

            <ContainerFill volume={volume} count={perContainer} parts={included.size} />

            <div className="mt-5 min-h-0 flex-1 overflow-auto pr-1">
              {PART_GROUPS.map((group) => {
                const rows = EXPLODE_PARTS.filter(
                  (part) => PART_META[part.id]?.group === group.id,
                );
                if (!rows.length) return null;
                return (
                  <div key={group.id} className="mb-4">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                      {group.label}
                    </p>
                    <ul className="space-y-1">
                      {rows.map((part) => {
                        const on = included.has(part.id);
                        return (
                          <li key={part.id}>
                            <button
                              type="button"
                              onClick={() => togglePart(part.id)}
                              className={`flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm transition ${
                                on
                                  ? "text-text-on-dark hover:bg-accent/10"
                                  : "text-white/35 line-through hover:bg-white/5"
                              }`}
                            >
                              {partLabel(part.id)}
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${on ? "bg-accent shadow-[0_0_8px_var(--accent)]" : "bg-white/20"}`}
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>

            {(diff.added.length > 0 || diff.removed.length > 0) && (
              <p className="mt-2 text-[11px] leading-relaxed text-accent/80">
                {diff.removed.length ? `− ${diff.removed.map(partLabel).join(", ")}` : null}
                {diff.removed.length && diff.added.length ? " · " : null}
                {diff.added.length ? `+ ${diff.added.map(partLabel).join(", ")}` : null}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <AnchorButton href={tgHref} target="_blank" rel="noopener noreferrer" className="w-full">
                Отправить бланк в Telegram
              </AnchorButton>
              <Button
                type="button"
                variant="secondary"
                className="w-full border-white/10 bg-transparent text-text-on-dark hover:bg-white/5"
                onClick={() => applyScheme(schemeId)}
              >
                Сбросить к схеме {scheme.code}
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function HoverChip({ part, on }: { part: ExplodePart; on: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-3 rounded-full border border-white/15 bg-black/70 px-4 py-2 backdrop-blur-md md:flex">
      <span className={`h-2 w-2 rounded-full ${on ? "bg-accent" : "bg-white/30"}`} />
      <span className="text-sm text-text-on-dark">{partLabel(part.id)}</span>
      <span className="text-[11px] uppercase tracking-[0.16em] text-white/40">
        {on ? "в бланке" : "исключено"}
      </span>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <svg viewBox="0 0 44 44" className="h-12 w-12 shrink-0 -rotate-90" aria-hidden>
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ContainerFill({
  volume,
  count,
  parts,
}: {
  volume: number;
  count: number;
  parts: number;
}) {
  const fill = Math.max(0, Math.min(100, Math.round((volume / CONTAINER_CAPACITY) * 100)));
  const stacks = Math.max(0, Math.min(12, count));

  return (
    <div className="kit-container mt-5 overflow-hidden rounded-xl border border-white/10 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
          40′ контейнер
        </p>
        <p className="font-display text-sm text-accent">до {count} шт.</p>
      </div>

      <div className="kit-container-bay relative mt-3 h-16 overflow-hidden rounded-lg border border-white/10 bg-black/40">
        <div className="kit-container-grid absolute inset-0 opacity-40" aria-hidden />
        <div
          className="kit-container-cargo absolute bottom-0 left-0 right-0 transition-[height] duration-500 ease-out"
          style={{ height: `${Math.max(8, fill)}%` }}
          aria-hidden
        />
        <div className="absolute inset-x-2 bottom-1.5 flex items-end justify-center gap-0.5">
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              className={`kit-container-crate ${i < stacks ? "is-on" : ""}`}
              style={{ transitionDelay: `${i * 28}ms` }}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-white/10 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-white/10 to-transparent" />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
        <span>
          {parts} поз. · объём {volume}/{CONTAINER_CAPACITY}
        </span>
        <span className="tabular-nums text-accent/90">{fill}%</span>
      </div>
      <p className="mt-1 text-[11px] text-white/35">
        Сколько таких комплектов встанет в один контейнер
      </p>
    </div>
  );
}
