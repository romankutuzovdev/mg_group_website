"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useSpring,
  type MotionValue,
} from "framer-motion";
import {
  EXPLODE_CAR,
  EXPLODE_PARTS,
  clamp01,
  explodeProgress,
  explodeTransform,
} from "@/lib/explode/parts";

const CAPTIONS = [
  { at: 0, title: "Автомобиль в сборе", sub: "Листайте — разборка на запчасти" },
  { at: 0.22, title: "Разборка на запчасти", sub: "Кузов, агрегаты и ходовая разлетаются сразу" },
  { at: 0.62, title: "Машинокомплекты", sub: "Разборка и поставка из США и Англии" },
  { at: 0.86, title: "Соберём или доставим под ключ", sub: "Доставка в Беларусь" },
];

export function CarDisassembly() {
  const containerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState<(typeof CAPTIONS)[number]>(CAPTIONS[0]);
  const [scrollPct, setScrollPct] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const smooth = useSpring(scrollYProgress, { stiffness: 32, damping: 42 });
  const glowOpacity = useTransform(smooth, [0, 0.35, 1], [0.35, 0.9, 0.22]);
  const hintOpacity = useTransform(smooth, [0, 0.08], [1, 0]);

  useMotionValueEvent(smooth, "change", (p) => {
    setScrollPct(p);
    setCaption([...CAPTIONS].reverse().find((c) => p >= c.at) ?? CAPTIONS[0]);

    const t = explodeProgress(p);
    const stage = stageRef.current;
    if (!stage) return;
    const k = stage.offsetWidth / 920;
    const photoFade = 1 - clamp01(t / 0.42);
    const partsFade = clamp01(t / 0.22);

    const car = stage.querySelector<HTMLElement>("[data-car]");
    if (car) car.style.opacity = String(photoFade);

    stage.querySelectorAll<HTMLElement>("[data-part]").forEach((node) => {
      const cfg = EXPLODE_PARTS.find((part) => part.id === node.dataset.part);
      if (!cfg) return;
      node.style.transform = explodeTransform(t, cfg, k);
      node.style.opacity = String(partsFade);
      node.style.filter = t > 0.06 ? "drop-shadow(0 18px 16px rgba(0,0,0,0.5))" : "none";
    });
  });

  return (
    <section ref={containerRef} className="relative h-[900vh] bg-bg-dark">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        <div className="bg-grid-dark absolute inset-0 opacity-25" />
        <div className="bg-noise absolute inset-0" />

        <motion.div
          className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(34,197,94,0.18) 0%, transparent 68%)",
            opacity: glowOpacity,
          }}
        />

        <div className="absolute top-24 z-20 mx-auto max-w-xl px-6 text-center md:top-28">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-text-on-dark md:text-4xl">
            {caption.title}
          </h2>
          <p className="mt-3 text-text-on-dark-muted">{caption.sub}</p>
        </div>

        <div className="relative z-10 w-full max-w-5xl px-4 md:px-8">
          <div
            ref={stageRef}
            className="explode-stage relative mx-auto w-full max-w-4xl"
            aria-label="Анимация разборки автомобиля при прокрутке"
          >
            <div className="explode-shadow" aria-hidden />

            {EXPLODE_PARTS.map((part) => (
              <div
                key={part.id}
                data-part={part.id}
                className="explode-item"
                style={{
                  left: `${part.left}%`,
                  top: `${part.top}%`,
                  width: `${part.w}%`,
                  height: `${part.h}%`,
                  zIndex: part.z,
                  opacity: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={part.src} alt="" draggable={false} />
              </div>
            ))}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="explode-car" data-car src={EXPLODE_CAR} alt="Автомобиль в сборе" draggable={false} />
          </div>
        </div>

        <ProgressRail progress={scrollPct} />
        <ScrollHint opacity={hintOpacity} />
      </div>
    </section>
  );
}

function ProgressRail({ progress }: { progress: number }) {
  return (
    <div className="absolute right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-3 md:flex">
      <span className="text-[10px] uppercase tracking-[0.2em] text-text-on-dark-muted [writing-mode:vertical-rl] rotate-180">
        Scroll
      </span>
      <div className="relative h-44 w-px bg-white/15">
        <div className="absolute left-0 top-0 w-full bg-[#22c55e]" style={{ height: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

function ScrollHint({ opacity }: { opacity: MotionValue<number> }) {
  return (
    <motion.div
      className="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2"
      style={{ opacity }}
    >
      <span className="text-[10px] uppercase tracking-[0.25em] text-text-on-dark-muted">Листайте вниз</span>
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        className="flex h-10 w-6 items-start justify-center rounded-full border border-accent/35 p-1.5"
      >
        <div className="h-2 w-1 rounded-full bg-[#22c55e]" />
      </motion.div>
    </motion.div>
  );
}
