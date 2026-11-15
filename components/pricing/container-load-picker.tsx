"use client";

import { cn } from "@/lib/utils";

export type ContainerLoad = 3 | 4;

type Props = {
  value: ContainerLoad;
  onChange: (v: ContainerLoad) => void;
  /** Доплата за тройку к морю, USD (null — тариф не найден). */
  surchargeUsd: number | null;
  /** Oversize всегда едет тройкой — переключатель заблокирован. */
  locked?: boolean;
};

/** Позиции машин в контейнере (left/width в % от внутренней ширины). */
const LAYOUT: Record<ContainerLoad, { left: number; width: number }[]> = {
  4: [
    { left: 1.5, width: 23 },
    { left: 26, width: 23 },
    { left: 50.5, width: 23 },
    { left: 75, width: 23 },
  ],
  3: [
    { left: 3, width: 28 },
    { left: 36, width: 28 },
    { left: 69, width: 28 },
  ],
};

function CarSide({ highlight }: { highlight?: boolean }) {
  return (
    <svg viewBox="0 0 120 48" className="h-full w-full" aria-hidden>
      <path
        d="M6 34 L8 24 Q10 20 16 19 L34 17 L46 7 Q50 4 56 4 L80 4 Q86 4 90 8 L100 18 L110 20 Q116 22 116 28 L116 34 Q116 37 113 37 L8 37 Q6 37 6 34 Z"
        className={highlight ? "fill-primary" : "fill-slate-400"}
      />
      <path d="M50 9 Q52 8 56 8 L66 8 L66 18 L40 18 Z" className="fill-white/70" />
      <path d="M70 8 L80 8 Q84 8 86 11 L93 18 L70 18 Z" className="fill-white/70" />
      <circle cx="30" cy="37" r="8" className="fill-slate-800" />
      <circle cx="30" cy="37" r="3.5" className="fill-slate-300" />
      <circle cx="94" cy="37" r="8" className="fill-slate-800" />
      <circle cx="94" cy="37" r="3.5" className="fill-slate-300" />
    </svg>
  );
}

export function ContainerLoadPicker({ value, onChange, surchargeUsd, locked }: Props) {
  const slots = LAYOUT[value];
  const options: { v: ContainerLoad; title: string; note: string }[] = [
    { v: 4, title: "4 авто", note: "стандарт, по прайсу" },
    {
      v: 3,
      title: "3 авто",
      note:
        surchargeUsd == null
          ? "больше места"
          : surchargeUsd > 0
            ? `больше места · +$${surchargeUsd.toLocaleString("en-US")}`
            : "больше места",
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-bg-base p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Загрузка контейнера
        </p>
        <p className="text-[11px] text-text-muted">
          {value === 3 ? "Ваше авто + 2 соседа" : "Ваше авто + 3 соседа"}
        </p>
      </div>

      {/* Контейнер */}
      <div className="relative mt-3 select-none">
        <div
          className="relative h-24 overflow-hidden rounded-md border-2 border-amber-700/80 sm:h-28"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(180,83,9,0.10) 0 6px, rgba(180,83,9,0.22) 6px 9px)",
            backgroundColor: "rgb(254 243 199)",
          }}
        >
          {/* пол */}
          <div className="absolute inset-x-0 bottom-0 h-3 bg-amber-800/30" />
          {/* двери справа */}
          <div className="absolute inset-y-0 right-0 w-1.5 bg-amber-800/60" />

          {/* 4 места: 4-я машина уезжает при тройке */}
          {[0, 1, 2, 3].map((i) => {
            const pos = slots[i];
            const visible = Boolean(pos);
            const last = LAYOUT[4][i];
            return (
              <div
                key={i}
                className="absolute bottom-2 h-[60%] transition-all duration-500 ease-out"
                style={{
                  left: `${visible ? pos.left : 108}%`,
                  width: `${(visible ? pos.width : last.width)}%`,
                  opacity: visible ? 1 : 0,
                }}
              >
                <CarSide highlight={i === 0} />
              </div>
            );
          })}

          {/* подсветка свободного места между машинами */}
          {value === 3
            ? [31, 64].map((l) => (
                <div
                  key={l}
                  className="absolute bottom-3 top-3 w-[5%] animate-pulse rounded border border-dashed border-emerald-500/70 bg-emerald-400/15"
                  style={{ left: `${l}%` }}
                />
              ))
            : null}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-text-muted">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary align-middle" />
            ваше авто
          </span>
          <span>40ft контейнер · двери →</span>
        </div>
      </div>

      {/* Переключатель */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {options.map((o) => {
          const active = value === o.v;
          const disabled = locked && o.v === 4;
          return (
            <button
              key={o.v}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.v)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition",
                active
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border bg-white hover:border-primary/50",
                disabled && "cursor-not-allowed opacity-40",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <span className="flex gap-0.5">
                  {Array.from({ length: o.v }).map((_, k) => (
                    <span
                      key={k}
                      className={cn("h-2 w-3 rounded-sm", k === 0 ? "bg-primary" : "bg-slate-400")}
                    />
                  ))}
                </span>
                {o.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-text-muted">{o.note}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
        {locked
          ? "Oversize всегда едет тройкой — в контейнер помещается только 3 таких авто."
          : value === 3
            ? "В контейнере всего 3 машины: больше места между авто, меньше риск задеть соседа при погрузке. Море по тарифу тройки."
            : "Стандартная загрузка — 4 машины в контейнере."}
      </p>
    </div>
  );
}
