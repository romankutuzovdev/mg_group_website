"use client";

import { useMemo, useState } from "react";

type ZoneId = "front" | "side" | "rear" | "roof" | "under";

type Zone = {
  id: ZoneId;
  label: string;
  hint: string;
  /** Polygon points in viewBox 0 0 1280 720 (car facing left) */
  points: string;
};

const ZONES: Zone[] = [
  {
    id: "front",
    label: "Перед",
    hint: "Морда, капот, радиатор, фары",
    points: "70,290 70,480 210,520 340,500 360,340 300,250 180,250 110,280",
  },
  {
    id: "side",
    label: "Бок",
    hint: "Двери, пороги, крылья",
    points: "360,300 360,510 920,510 920,300 760,250 480,250",
  },
  {
    id: "rear",
    label: "Зад",
    hint: "Багажник, фонари, задняя панель",
    points: "920,280 920,510 1100,500 1210,460 1210,300 1120,250 980,240",
  },
  {
    id: "roof",
    label: "Крыша",
    hint: "Крыша, стойки, панорама",
    points: "380,180 420,145 780,140 900,165 940,230 880,250 420,255",
  },
  {
    id: "under",
    label: "Низ",
    hint: "Днище, подвеска, рама",
    points: "220,455 220,520 1080,520 1080,455 920,470 360,470",
  },
];

function detectZones(damage: string): ZoneId[] {
  const t = damage.toLowerCase();
  const hit = new Set<ZoneId>();

  if (/front|перед|nose|hood|капот|radiator|bumper|бампер|collision/.test(t)) hit.add("front");
  if (/side|бок|door|двер|fender|крыл|left|right|лев|прав/.test(t)) hit.add("side");
  if (/rear|зад|trunk|багаж|tail/.test(t)) hit.add("rear");
  if (/roof|крыш|hail|град|rollover|переворот/.test(t)) hit.add("roof");
  if (/under|низ|flood|вода|water|frame|рам|suspension|подвес/.test(t)) hit.add("under");
  if (/all|total|burn|пожар|полный/.test(t)) {
    hit.add("front");
    hit.add("side");
    hit.add("rear");
    hit.add("roof");
  }

  if (hit.size === 0) hit.add("front");
  return Array.from(hit);
}

type Props = {
  primaryDamage: string;
  secondaryDamage?: string | null;
};

export function LotDamageMap({ primaryDamage, secondaryDamage }: Props) {
  const active = useMemo(
    () => detectZones([primaryDamage, secondaryDamage].filter(Boolean).join(" ")),
    [primaryDamage, secondaryDamage],
  );
  const [focus, setFocus] = useState<ZoneId | null>(active[0] ?? null);
  const current = ZONES.find((z) => z.id === focus) ?? ZONES[0];

  return (
    <div className="card-premium rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="lux-kicker">Осмотр повреждений</p>
          <h2 className="mt-2 font-display text-lg font-semibold">Карта зон кузова</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Подсветка по описанию лота: {primaryDamage}
            {secondaryDamage ? ` · ${secondaryDamage}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_200px]">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-zinc-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/auctions/damage-map-sedan.png"
            alt="Схема кузова седана"
            className="block h-auto w-full select-none"
            draggable={false}
          />
          <svg
            viewBox="0 0 1280 720"
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Зоны повреждений на кузове"
          >
            {ZONES.map((zone) => {
              const on = active.includes(zone.id);
              const selected = focus === zone.id;
              return (
                <polygon
                  key={zone.id}
                  points={zone.points}
                  role="button"
                  tabIndex={0}
                  aria-label={zone.label}
                  onClick={() => setFocus(zone.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFocus(zone.id);
                    }
                  }}
                  className="cursor-pointer outline-none transition-[fill,stroke,opacity] duration-300"
                  fill={
                    on
                      ? selected
                        ? "rgba(34,197,94,0.45)"
                        : "rgba(34,197,94,0.22)"
                      : selected
                        ? "rgba(24,24,27,0.14)"
                        : "rgba(24,24,27,0.02)"
                  }
                  stroke={
                    selected
                      ? "rgba(22,163,74,0.95)"
                      : on
                        ? "rgba(34,197,94,0.55)"
                        : "transparent"
                  }
                  strokeWidth={selected ? 4 : on ? 2.5 : 0}
                  strokeLinejoin="round"
                />
              );
            })}
          </svg>
        </div>

        <div className="space-y-2">
          {ZONES.map((zone) => {
            const on = active.includes(zone.id);
            const selected = focus === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => setFocus(zone.id)}
                className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  selected
                    ? "border-accent/40 bg-accent/10"
                    : "border-border hover:border-accent/25"
                }`}
              >
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    on ? "bg-accent shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-zinc-300"
                  }`}
                />
                <span>
                  <span className="font-medium">{zone.label}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">{zone.hint}</span>
                </span>
              </button>
            );
          })}
          <p className="pt-2 text-xs text-text-muted">
            Зона: <span className="font-medium text-text-primary">{current.label}</span> —{" "}
            {current.hint}
          </p>
        </div>
      </div>
    </div>
  );
}
