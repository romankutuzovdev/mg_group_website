"use client";

import Image from "next/image";

const lens =
  "radial-gradient(circle var(--lens, 180px) at var(--rx, -400px) var(--ry, -400px), #000 0%, #000 58%, transparent 100%)";

const frame = "object-cover object-[58%_46%] sm:object-[64%_42%]";

function place(target: HTMLElement, x: number, y: number, on: boolean) {
  const radius = Math.round(Math.min(220, Math.max(110, target.clientWidth * 0.14)));
  target.style.setProperty("--lens", `${radius}px`);
  target.style.setProperty("--rx", `${x}px`);
  target.style.setProperty("--ry", `${y}px`);
  target.dataset.revealing = on ? "true" : "false";
}

export function HeroCarReveal() {
  return (
    <div
      data-car-reveal=""
      data-revealing="false"
      aria-describedby="hero-car-hint"
      className="group absolute inset-0 z-0 touch-pan-y"
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        place(event.currentTarget, event.clientX - rect.left, event.clientY - rect.top, true);
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") place(event.currentTarget, 0, 0, false);
      }}
      onPointerLeave={(event) => place(event.currentTarget, 0, 0, false)}
      onPointerCancel={(event) => place(event.currentTarget, 0, 0, false)}
    >
      <Image
        src="/hero/mercedes-whole.jpg"
        alt="Mercedes-AMG S-Class MG.GROUP"
        fill
        priority
        sizes="100vw"
        className={frame}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 motion-reduce:transition-none group-data-[revealing=true]:opacity-100"
        style={{ maskImage: lens, WebkitMaskImage: lens }}
      >
        <Image src="/hero/mercedes-cutaway.jpg" alt="" fill sizes="100vw" className={frame} />
      </div>
    </div>
  );
}
