"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  AUCTION_ORIGINS,
  CITY_MINSK,
  LAND_NOVOROSSIYSK_MINSK,
  ROUTE_STOPS,
  YARDS,
  auctionPath,
  type YardId,
} from "@/lib/kits/yards";

type WorldSeaMapProps = {
  activeId: YardId;
  onSelect: (id: YardId) => void;
};

export function WorldSeaMap({ activeId, onSelect }: WorldSeaMapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const seaLinesRef = useRef<Partial<Record<YardId, L.Polyline>>>({});
  const markersRef = useRef<Partial<Record<YardId, L.Marker>>>({});
  const feedersRef = useRef<L.Polyline[]>([]);
  const auctionsRef = useRef<L.CircleMarker[]>([]);
  const usLandRef = useRef<L.Polyline | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 8,
      worldCopyJump: false,
      maxBoundsViscosity: 0.85,
    });
    mapRef.current = map;
    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution:
          'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, Maxar, Earthstar Geographics',
      },
    ).addTo(map);

    for (const origin of AUCTION_ORIGINS) {
      const hub = YARDS.find((yard) => yard.id === origin.hub);
      if (!hub) continue;

      const feeder = L.polyline(auctionPath(origin, hub), {
        color: "#86efac",
        weight: 1.25,
        opacity: 0.22,
        dashArray: "3 7",
      }).addTo(map);
      feedersRef.current.push(feeder);

      const dot = L.circleMarker([origin.lat, origin.lng], {
        radius: 4,
        color: "#bbf7d0",
        weight: 1,
        fillColor: "#14532d",
        fillOpacity: 1,
      })
        .bindTooltip(`Аукцион · ${origin.label}`, { permanent: false, direction: "top" })
        .addTo(map);
      auctionsRef.current.push(dot);
    }

    usLandRef.current = L.polyline(LAND_NOVOROSSIYSK_MINSK, {
      color: "#86efac",
      weight: 2,
      opacity: 0.7,
      dashArray: "2 8",
    }).addTo(map);

    for (const yard of YARDS) {
      const land = yard.routeKind === "land";
      const line = L.polyline(yard.seaRoute, {
        color: land ? "#86efac" : "#22c55e",
        weight: 2,
        opacity: 0.28,
        dashArray: land ? "2 8" : "10 8",
      }).addTo(map);
      seaLinesRef.current[yard.id] = line;

      const marker = L.marker([yard.lat, yard.lng], {
        icon: pinIcon(yard.code, yard.city, false),
        title: yard.city,
      }).addTo(map);
      marker.on("click", () => onSelectRef.current(yard.id));
      markersRef.current[yard.id] = marker;
    }

    for (const stop of ROUTE_STOPS) {
      L.marker(stop.latlng, {
        icon: stopIcon(stop.label, stop.kind, stop.align),
      })
        .bindTooltip(stop.hint, { permanent: false, direction: "top" })
        .addTo(map);
    }

    map.fitBounds(allBounds(), { padding: [36, 36], maxZoom: 4 });
    map.setMaxBounds(allBounds().pad(0.55));
    const t1 = window.setTimeout(() => map.invalidateSize(), 80);
    const t2 = window.setTimeout(() => map.invalidateSize(), 400);

    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
      seaLinesRef.current = {};
      markersRef.current = {};
      feedersRef.current = [];
      auctionsRef.current = [];
      usLandRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const yard of YARDS) {
      markersRef.current[yard.id]?.setIcon(pinIcon(yard.code, yard.city, yard.id === activeId));
      const line = seaLinesRef.current[yard.id];
      if (!line) continue;
      const on = yard.id === activeId;
      const land = yard.routeKind === "land";
      line.setStyle({
        weight: on ? 3.5 : 2,
        opacity: on ? 0.95 : 0.22,
        dashArray: land ? "2 8" : "10 8",
      });
    }

    feedersRef.current.forEach((line, index) => {
      const origin = AUCTION_ORIGINS[index];
      const on = origin?.hub === activeId;
      line.setStyle({
        weight: on ? 2 : 1.25,
        opacity: on ? 0.7 : 0.12,
        dashArray: "3 7",
      });
    });

    auctionsRef.current.forEach((dot, index) => {
      const origin = AUCTION_ORIGINS[index];
      const on = origin?.hub === activeId;
      dot.setStyle({
        radius: on ? 5 : 4,
        opacity: on ? 1 : 0.35,
        fillOpacity: on ? 1 : 0.35,
      });
    });

    usLandRef.current?.setStyle({
      opacity: activeId === "uk" ? 0.18 : 0.75,
      weight: activeId === "uk" ? 2 : 2.5,
    });

    const yard = YARDS.find((item) => item.id === activeId);
    if (!yard) return;
    const extra = AUCTION_ORIGINS.filter((origin) => origin.hub === activeId).flatMap((origin) =>
      auctionPath(origin, yard),
    );
    const landTail = activeId === "uk" ? [] : LAND_NOVOROSSIYSK_MINSK;
    map.fitBounds(L.latLngBounds([...yard.seaRoute, ...landTail, ...extra, CITY_MINSK]), {
      padding: [40, 40],
      maxZoom: 5,
      animate: true,
    });
    window.setTimeout(() => map.invalidateSize(), 50);
  }, [activeId]);

  return <div ref={rootRef} className="yard-leaflet absolute inset-0 h-full w-full overflow-hidden" />;
}

function pinIcon(code: string, city: string, active: boolean) {
  return L.divIcon({
    className: `yard-map-marker${active ? " is-active" : ""}`,
    html: `<span class="yard-map-marker-ring"></span><span class="yard-map-marker-dot"></span><span class="yard-map-marker-label"><b>${code}</b>${city}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function stopIcon(label: string, kind: "sea" | "land", align?: "left" | "right") {
  return L.divIcon({
    className: `yard-stop-marker yard-stop-${kind}${align === "left" ? " yard-stop-align-left" : ""}`,
    html: `<span class="yard-stop-dot"></span><span class="yard-stop-label">${label}</span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function allBounds() {
  const points = [
    ...YARDS.flatMap((yard) => yard.seaRoute),
    ...AUCTION_ORIGINS.map((origin): [number, number] => [origin.lat, origin.lng]),
    CITY_MINSK,
  ];
  return L.latLngBounds(points);
}
