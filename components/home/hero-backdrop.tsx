"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

/**
 * Лёгкий параллакс фона hero без WebGL.
 * Работает только на desktop pointer + если блок в кадре.
 */
export function HeroBackdrop() {
  const layerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (reduce || !fine) return;

    let visible = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (!visible) {
          target.current = { x: 0, y: 0 };
        }
      },
      { threshold: 0.05 },
    );
    io.observe(layer);

    const onMove = (e: PointerEvent) => {
      if (!visible) return;
      const rect = layer.getBoundingClientRect();
      target.current = {
        x: ((e.clientX - rect.left) / rect.width - 0.5) * 18,
        y: ((e.clientY - rect.top) / rect.height - 0.5) * 12,
      };
    };

    const onLeave = () => {
      target.current = { x: 0, y: 0 };
    };

    const tick = () => {
      current.current.x += (target.current.x - current.current.x) * 0.08;
      current.current.y += (target.current.y - current.current.y) * 0.08;
      layer.style.transform = `translate3d(${current.current.x}px, ${current.current.y}px, 0) scale(1.06)`;
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    layer.addEventListener("pointerleave", onLeave);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      layer.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-bg-dark">
      <div
        ref={layerRef}
        className="hero-parallax-layer absolute inset-[-3%] will-change-transform"
      >
        <Image
          src="/hero-mercedes-night.png"
          alt=""
          fill
          sizes="100vw"
          priority
          className="hero-photo object-cover object-[26%_50%] md:object-[68%_58%]"
          aria-hidden
        />
        <video
          className="hero-video absolute inset-0 h-full w-full object-cover object-[26%_50%] md:object-[68%_58%]"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/hero-mercedes-night.png"
          aria-hidden
        >
          <source src="/hero-car.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  );
}
