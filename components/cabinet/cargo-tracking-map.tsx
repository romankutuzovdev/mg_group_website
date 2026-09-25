"use client";

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { Deal, StageKey } from "@/lib/api/cabinet";
import { MAP_STAGE_KEYS } from "@/lib/api/cabinet";

type LatLng = [number, number];

type RoutePoint = {
  key: StageKey;
  label: string;
  hint: string;
  latlng: LatLng;
};

function buildRoute(deal: Deal): { points: RoutePoint[]; path: LatLng[] } {
  const uk = deal.origin_region === "uk";
  const port = deal.origin_point === "port";

  const origin: RoutePoint = uk
    ? port
      ? {
          key: "origin",
          label: "Порт UK",
          hint: "Southampton",
          latlng: [50.9, -1.4],
        }
      : {
          key: "origin",
          label: "Разборка UK",
          hint: "Лондон",
          latlng: [51.45, -0.28],
        }
    : port
      ? {
          key: "origin",
          label: "Порт США",
          hint: "Newark / NY",
          latlng: [40.68, -74.15],
        }
      : {
          key: "origin",
          label: "Разборка США",
          hint: "Нью-Джерси",
          latlng: [40.55, -74.25],
        };

  const ocean: RoutePoint = uk
    ? {
        key: "ocean",
        label: "Европа",
        hint: "Сухопутный переход",
        latlng: [49.0, 6.1],
      }
    : {
        key: "ocean",
        label: "Море",
        hint: "Атлантика → Чёрное море",
        latlng: [38.5, -30.0],
      };

  const belarus: RoutePoint = {
    key: "belarus",
    label: "Беларусь",
    hint: "Гродно · таможня",
    latlng: [53.6778, 23.8298],
  };

  const delivery: RoutePoint = {
    key: "delivery",
    label: "Клиент",
    hint: "Минск · выдача",
    latlng: [53.9045, 27.5615],
  };

  const points = [origin, ocean, belarus, delivery];

  // Softer path with midpoints so the line arcs nicely
  const path: LatLng[] = uk
    ? [
        origin.latlng,
        [50.2, 2.5],
        ocean.latlng,
        [51.5, 16.0],
        belarus.latlng,
        delivery.latlng,
      ]
    : [
        origin.latlng,
        [41.0, -50.0],
        ocean.latlng,
        [36.0, 5.0],
        [44.7, 37.8], // Novorossiysk
        belarus.latlng,
        delivery.latlng,
      ];

  return { points, path };
}

function stageStatus(deal: Deal, key: StageKey): "done" | "active" | "pending" {
  const stage = deal.stages.find((s) => s.key === key);
  return stage?.status || "pending";
}

function CargoTrackingMapInner({ deal }: { deal: Deal }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  const { points, path } = useMemo(() => buildRoute(deal), [deal]);
  const statuses = useMemo(
    () =>
      Object.fromEntries(
        MAP_STAGE_KEYS.map((k) => [k, stageStatus(deal, k)]),
      ) as Record<StageKey, "done" | "active" | "pending">,
    [deal],
  );

  const doneCount = MAP_STAGE_KEYS.filter((k) => statuses[k] === "done").length;
  const total = MAP_STAGE_KEYS.length;
  const remaining = Math.max(total - doneCount - (MAP_STAGE_KEYS.some((k) => statuses[k] === "active") ? 0 : 0), 0);
  const activePoint = points.find((p) => statuses[p.key] === "active") || points.find((p) => statuses[p.key] === "pending");
  const progressPct = Math.round((doneCount / total) * 100);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !rootRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(rootRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: true,
        doubleClickZoom: false,
      });
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 18,
        subdomains: "abcd",
      }).addTo(map);

      const doneIdx = Math.max(
        0,
        points.reduce((acc, p, i) => (statuses[p.key] === "done" ? i + 1 : acc), 0),
      );
      const activeIdx = points.findIndex((p) => statuses[p.key] === "active");
      const progressIdx = activeIdx >= 0 ? activeIdx : doneIdx;

      // Full route (muted)
      L.polyline(path, {
        color: "#d4d4d8",
        weight: 2.5,
        opacity: 1,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      // Completed portion — approximate by slice of path
      if (progressIdx > 0) {
        const completedPath = path.slice(0, Math.min(path.length, progressIdx + 2));
        L.polyline(completedPath, {
          color: "#16a34a",
          weight: 3,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);
      }

      for (const point of points) {
        const st = statuses[point.key];
        const isActive = st === "active";
        const isDone = st === "done";
        const color = isDone ? "#16a34a" : isActive ? "#0D3F10" : "#a1a1aa";
        const fill = isDone ? "#16a34a" : isActive ? "#22c55e" : "#ffffff";

        const marker = L.circleMarker(point.latlng, {
          radius: isActive ? 9 : 7,
          color,
          weight: isActive ? 3 : 2,
          fillColor: fill,
          fillOpacity: isDone ? 1 : isActive ? 1 : 0.95,
          className: isActive ? "cargo-pulse" : undefined,
        }).addTo(map);

        marker.bindTooltip(
          `<div style="font:600 12px/1.2 system-ui,sans-serif;color:#18181b">${point.label}</div>
           <div style="font:400 11px/1.3 system-ui,sans-serif;color:#71717a;margin-top:2px">${point.hint}</div>`,
          {
            direction: "top",
            offset: [0, -8],
            opacity: 1,
            className: "cargo-tip",
          },
        );

        if (isActive) {
          marker.openTooltip();
        }
      }

      const bounds = L.latLngBounds(path);
      map.fitBounds(bounds.pad(0.22));
    }

    void mount();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [deal.id, deal.origin_region, deal.origin_point, points, path, statuses]);

  const leftLabel =
    remaining <= 0 && doneCount >= total
      ? "Груз у клиента"
      : activePoint
        ? `Сейчас: ${activePoint.label}`
        : "В пути";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/80">
            Где груз
          </p>
          <p className="mt-1 font-display text-lg font-semibold tracking-tight text-zinc-900">
            {leftLabel}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {doneCount} из {total} точек ·{" "}
            {remaining > 0 ? `осталось ${Math.max(total - doneCount, 0)}` : "маршрут завершён"}
          </p>
        </div>
        <div className="min-w-[7rem] text-right">
          <p className="font-display text-2xl font-semibold tabular-nums text-zinc-900">
            {progressPct}%
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="relative">
        <div ref={rootRef} className="h-[240px] w-full sm:h-[300px]" />
        <style jsx global>{`
          .cargo-tip {
            background: rgba(255, 255, 255, 0.96) !important;
            border: 1px solid #e4e4e7 !important;
            border-radius: 10px !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08) !important;
            padding: 8px 10px !important;
            color: #18181b !important;
          }
          .cargo-tip::before {
            border-top-color: #e4e4e7 !important;
          }
          .cargo-pulse {
            animation: cargo-pulse 1.8s ease-out infinite;
          }
          @keyframes cargo-pulse {
            0% {
              opacity: 1;
            }
            70% {
              opacity: 0.55;
            }
            100% {
              opacity: 1;
            }
          }
        `}</style>
      </div>

      <ol className="grid grid-cols-2 gap-px border-t border-border bg-zinc-100 sm:grid-cols-4">
        {points.map((point) => {
          const st = statuses[point.key];
          return (
            <li
              key={point.key}
              className={`bg-white px-3 py-2.5 ${
                st === "active" ? "bg-emerald-50/80" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    st === "done"
                      ? "bg-emerald-500"
                      : st === "active"
                        ? "bg-emerald-600 ring-2 ring-emerald-200"
                        : "bg-zinc-300"
                  }`}
                />
                <p className="text-xs font-semibold text-zinc-900">{point.label}</p>
              </div>
              <p className="mt-0.5 pl-3 text-[10px] text-zinc-500">{point.hint}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export const CargoTrackingMap = dynamic(
  () => Promise.resolve({ default: CargoTrackingMapInner }),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] items-center justify-center rounded-2xl border border-border bg-zinc-50 text-sm text-zinc-400">
        Загрузка карты…
      </div>
    ),
  },
);
