"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const RouteCarGlb = dynamic(
  () => import("@/components/home/route-car-glb").then((m) => m.RouteCarGlb),
  {
    ssr: false,
    loading: () => (
      <div className="h-28 w-40 animate-pulse rounded-2xl bg-white/5 sm:h-32 sm:w-48" aria-hidden />
    ),
  },
);

type Props = {
  /** 0..1 progress along the route */
  progress: number;
  /** Pointer tilt for parallax (optional) */
  tiltX?: number;
  tiltY?: number;
  className?: string;
  reduced?: boolean;
};

/** 3D GLB sedan (Kenney · CC0) with soft loading fallback. */
export function RouteCar3d({
  progress,
  tiltX = 0,
  tiltY = 0,
  className = "",
  reduced = false,
}: Props) {
  return (
    <RouteCarGlb
      progress={progress}
      tiltX={tiltX}
      tiltY={tiltY}
      className={className}
      reduced={reduced}
    />
  );
}

const STEPS = [
  {
    id: "pick",
    step: "01",
    title: "Подбор лота",
    desc: "Фильтры, VIN, Carfax, расчёт ремонта и таможни",
    place: "Аукцион США",
  },
  {
    id: "auction",
    step: "02",
    title: "Аукцион",
    desc: "Ставка через брокера MG.GROUP",
    place: "Copart / IAAI",
  },
  {
    id: "usa",
    step: "03",
    title: "Логистика США",
    desc: "Склад → порт → экспортные документы",
    place: "Порт США",
  },
  {
    id: "sea",
    step: "04",
    title: "Море + таможня",
    desc: "Турция → Новороссийск → Гродно → Минск",
    place: "Атлантика",
  },
  {
    id: "keys",
    step: "05",
    title: "Выдача",
    desc: "Доставка автовозом, СБКТС, помощь с таможней",
    place: "Гродно / Минск",
  },
] as const;

/** Interactive route: 3D car drives along the path as stages change. */
export function ProcessRouteJourney() {
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tilt, setTilt] = useState({ x: 12, y: -18 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!playing || reduced) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % STEPS.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [playing, reduced]);

  const progress = active / Math.max(STEPS.length - 1, 1);

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: 10 + ny * 14, y: -18 + nx * 22 });
  };

  return (
    <section
      ref={rootRef}
      className="relative overflow-hidden bg-stone-950 py-14 text-white md:py-24"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setTilt({ x: 12, y: -18 })}
      onMouseEnter={() => setPlaying(false)}
      onMouseLeave={() => setPlaying(true)}
      onFocusCapture={() => setPlaying(false)}
      onBlurCapture={() => setPlaying(true)}
      aria-label="Путь автомобиля от аукциона до выдачи"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_480px_at_20%_0%,rgba(34,197,94,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_400px_at_90%_80%,rgba(34,197,94,0.08),transparent_50%)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Путь</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              От аукциона до ключей
            </h2>
          </div>
          <p className="max-w-sm text-base text-white/60">
            Средний срок — 2–3 месяца. Наведите на этап или дождитесь, пока машина проедет путь.
          </p>
        </div>

        {/* Stage stage with moving car */}
        <div className="relative mt-12 rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-stone-900/90 to-stone-950 p-5 shadow-[0_40px_100px_-50px_rgba(34,197,94,0.45)] sm:mt-14 sm:p-8 md:p-10">
          <div className="pointer-events-none absolute inset-0 rounded-[1.75rem] bg-[linear-gradient(120deg,transparent_40%,rgba(255,255,255,0.03)_50%,transparent_60%)]" />

          <div className="relative mb-10 hidden h-52 overflow-visible md:block" aria-hidden>
            {/* Track inset so edge labels fit inside the card */}
            <div className="absolute inset-x-10 inset-y-0 lg:inset-x-14">
              {/* road */}
              <div className="absolute left-0 right-0 top-[58%] h-3 -translate-y-1/2 overflow-hidden rounded-full bg-stone-800 ring-1 ring-white/10">
                <div className="absolute inset-y-1 left-0 right-0 bg-[repeating-linear-gradient(90deg,transparent_0_18px,#22c55e55_18px_28px)] opacity-70" />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/80 to-primary/20 transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(progress * 100, 4)}%` }}
                />
              </div>

              {/* waypoints */}
              {STEPS.map((s, i) => {
                const left = `${(i / (STEPS.length - 1)) * 100}%`;
                const on = i <= active;
                const edge =
                  i === 0 ? "items-start text-left" : i === STEPS.length - 1 ? "items-end text-right" : "items-center text-center";
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={[
                      "absolute top-[58%] z-20 flex -translate-y-1/2 cursor-pointer flex-col",
                      i === 0
                        ? "left-0 translate-x-0"
                        : i === STEPS.length - 1
                          ? "right-0 translate-x-0"
                          : "-translate-x-1/2",
                      edge,
                    ].join(" ")}
                    style={i > 0 && i < STEPS.length - 1 ? { left } : undefined}
                    onClick={() => setActive(i)}
                    aria-label={`${s.step}. ${s.title}`}
                    aria-current={i === active ? "step" : undefined}
                  >
                    <span
                      className={[
                        "flex h-11 w-11 items-center justify-center rounded-full text-xs font-bold transition duration-300",
                        on
                          ? "bg-primary text-stone-950 shadow-[0_0_24px_rgba(34,197,94,0.55)] ring-2 ring-primary/40"
                          : "bg-stone-800 text-white/50 ring-1 ring-white/15 hover:text-white",
                      ].join(" ")}
                    >
                      {s.step}
                    </span>
                    <span className="mt-3 max-w-[7.5rem] text-[10px] font-semibold uppercase leading-snug tracking-[0.12em] text-white/55 lg:max-w-none lg:whitespace-nowrap lg:text-[11px]">
                      {s.place}
                    </span>
                  </button>
                );
              })}

              {/* Real 3D GLB car */}
              <div
                className="absolute top-0 z-30 -translate-x-1/2 transition-[left] duration-700 ease-out"
                style={{ left: `${progress * 100}%` }}
              >
                <RouteCar3d
                  progress={progress}
                  tiltX={tilt.x}
                  tiltY={tilt.y}
                  reduced={reduced}
                />
              </div>
            </div>
          </div>

          {/* Mobile: vertical path with car accent */}
          <div className="mb-6 space-y-3 md:hidden">
            {STEPS.map((s, i) => {
              const on = i === active;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={[
                    "flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition",
                    on
                      ? "border-primary/40 bg-primary/10"
                      : "border-white/10 bg-white/5 hover:border-white/20",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      on ? "bg-primary text-stone-950" : "bg-stone-800 text-white/60",
                    ].join(" ")}
                  >
                    {s.step}
                  </span>
                  <span>
                    <span className="block text-lg font-semibold text-white">{s.title}</span>
                    <span className="mt-1 block text-sm text-white/60">{s.desc}</span>
                  </span>
                </button>
              );
            })}
            <div className="flex justify-center py-3">
              <RouteCar3d
                progress={progress}
                tiltX={14}
                tiltY={-10}
                reduced={reduced}
              />
            </div>
          </div>

          {/* Active step detail cards */}
          <div className="relative hidden gap-4 md:grid md:grid-cols-5">
            {STEPS.map((s, i) => {
              const on = i === active;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={[
                    "cursor-pointer rounded-2xl border p-4 text-left transition duration-300",
                    on
                      ? "border-primary/50 bg-gradient-to-b from-primary/20 to-transparent shadow-[0_20px_50px_-30px_rgba(34,197,94,0.8)]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/90">
                    {s.step}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{s.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-sm text-white/50">
            <p>
              Сейчас:{" "}
              <span className="font-semibold text-white">{STEPS[active].title}</span>
              {" · "}
              {STEPS[active].place}
            </p>
            <button
              type="button"
              className="cursor-pointer rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/80 transition hover:border-primary hover:text-primary"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing && !reduced ? "Пауза" : "Автопроигрывание"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
