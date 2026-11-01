"use client";

import Image from "next/image";
import { ScanLine } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";

const frame = "object-cover object-[62%_46%] sm:object-[64%_42%]";

export function HeroCarReveal() {
  const surface = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [position, setPosition] = useState(70);

  function place(x: number, y: number) {
    const element = surface.current;
    if (!element) return;
    element.style.setProperty("--rx", `${x}%`);
    element.style.setProperty("--ry", `${y}%`);
  }

  return (
    <>
      <div ref={surface} data-revealing={enabled} className="group absolute inset-0 z-0 touch-pan-y"
        style={{ "--rx": "70%", "--ry": "50%" } as CSSProperties}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const rect = event.currentTarget.getBoundingClientRect();
          place(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
          event.currentTarget.dataset.revealing = "true";
        }}
        onPointerLeave={(event) => {
          event.currentTarget.dataset.revealing = String(enabled);
          place(position, 50);
        }}>
        <Image src="/hero/mercedes-whole.jpg" alt="Mercedes-AMG S-Class MG.GROUP" fill priority sizes="100vw" className={frame} />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 motion-reduce:transition-none group-data-[revealing=true]:opacity-100"
          style={{ maskImage: "radial-gradient(circle clamp(120px, 19vw, 300px) at var(--rx) var(--ry), #000 0%, #000 72%, transparent 100%)", WebkitMaskImage: "radial-gradient(circle clamp(120px, 19vw, 300px) at var(--rx) var(--ry), #000 0%, #000 72%, transparent 100%)" }}>
          <Image src="/hero/mercedes-cutaway.jpg" alt="" fill sizes="100vw" className={frame} />
        </div>
      </div>
      <div className="absolute bottom-7 right-4 z-20 w-[calc(100%_-_2rem)] max-w-[21rem] border-t border-white/25 pt-4 text-white sm:right-6 lg:right-[max(2rem,calc((100vw-76rem)/2))]">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/65">Взгляд изнутри</span>
          <button type="button" aria-pressed={enabled} aria-controls="hero-xray-position" onClick={() => {
            const next = !enabled;
            setEnabled(next);
            if (surface.current) surface.current.dataset.revealing = String(next);
            place(position, 50);
          }} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <ScanLine className={`h-4 w-4 ${enabled ? "text-primary" : "text-white/70"}`} aria-hidden /> Рентген {enabled ? "вкл." : "выкл."}
          </button>
        </div>
        <label htmlFor="hero-xray-position" className="block text-xs text-white/70">Двигайте ползунок, чтобы заглянуть под кузов</label>
        <input id="hero-xray-position" type="range" min="0" max="100" value={position} aria-label="Положение рентгена автомобиля" aria-valuetext={`${position}% ширины изображения`} onChange={(event) => {
          const value = Number(event.target.value);
          setPosition(value);
          setEnabled(true);
          place(value, 50);
          if (surface.current) surface.current.dataset.revealing = "true";
        }} className="mt-1 h-11 w-full cursor-ew-resize accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
      </div>
    </>
  );
}
