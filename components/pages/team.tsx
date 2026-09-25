"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { TEAM, type TeamMember } from "@/lib/company";

function Portrait({ member }: { member: TeamMember }) {
  if (member.photo) {
    return (
      <Image
        src={member.photo}
        alt={member.name ? `${member.name} — ${member.role}` : member.role}
        fill
        sizes="240px"
        className={`img-lux object-cover ${member.photoClass ?? "object-top"}`}
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a]" aria-hidden>
      <svg
        viewBox="0 0 160 200"
        className="absolute inset-x-0 bottom-8 mx-auto h-[70%] w-auto text-white/12"
        fill="currentColor"
      >
        <circle cx="80" cy="58" r="28" />
        <path d="M28 188c4-44 24-68 52-68s48 24 52 68H28Z" />
      </svg>
    </div>
  );
}

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      {dir === "prev" ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 5.5 9 12l6.5 6.5" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 5.5 15 12l-6.5 6.5" />
      )}
    </svg>
  );
}

export function Team({ embedded = false }: { embedded?: boolean }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = TEAM.length;

  const goTo = useCallback((index: number, smooth = true) => {
    const root = scrollerRef.current;
    if (!root) return;
    const i = (index + count) % count;
    const card = root.querySelectorAll<HTMLElement>("[data-team-card]")[i];
    if (!card) return;
    const left = card.offsetLeft - (root.clientWidth - card.clientWidth) / 2;
    root.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  }, [count]);

  const syncActive = useCallback(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const mid = root.scrollLeft + root.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    root.querySelectorAll<HTMLElement>("[data-team-card]").forEach((card, i) => {
      const dist = Math.abs(card.offsetLeft + card.clientWidth / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActive(best);
  }, []);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const frame = requestAnimationFrame(() => goTo(0, false));
    const onScroll = () => syncActive();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", syncActive);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", syncActive);
    };
  }, [goTo, syncActive]);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => goTo(active + 1), 4200);
    return () => window.clearInterval(timer);
  }, [active, goTo, paused]);

  return (
    <section
      id="team"
      className={
        embedded
          ? "mt-16 overflow-x-hidden"
          : "overflow-x-hidden border-t border-border bg-bg-base py-14 md:py-24"
      }
    >
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <p className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-[#22c55e]">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-[#22c55e] sm:w-12" />
          Команда
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-[#22c55e] sm:w-12" />
        </p>
        <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
          Команда профессионалов
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm text-text-secondary sm:text-base">
          Подбор, финансы, продажи и логистика — люди, которые ведут сделку до выдачи авто.
        </p>
      </div>

      <div
        className="relative left-1/2 mt-10 w-screen max-w-[100vw] -translate-x-1/2 sm:mt-14"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setPaused(false);
          }
        }}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-12 bg-gradient-to-r from-bg-base to-transparent sm:w-24 md:w-40" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-12 bg-gradient-to-l from-bg-base to-transparent sm:w-24 md:w-40" />

        <div
          ref={scrollerRef}
          className="team-scroller flex snap-x snap-mandatory gap-4 overflow-x-auto px-[max(1rem,calc(50%-var(--team-card)/2))] py-4 sm:gap-5 md:gap-6"
          tabIndex={0}
          role="region"
          aria-roledescription="карусель"
          aria-label="Команда профессионалов"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              goTo(active - 1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              goTo(active + 1);
            }
          }}
        >
          {TEAM.map((member, index) => {
            const selected = index === active;
            return (
              <article
                key={member.id}
                data-team-card
                className={`group relative w-[var(--team-card)] shrink-0 snap-center overflow-hidden rounded-2xl border bg-bg-dark transition-[transform,opacity,border-color,box-shadow] duration-500 ${
                  selected
                    ? "z-[1] scale-100 border-[#22c55e]/50 opacity-100 shadow-[0_22px_48px_-18px_rgba(0,0,0,0.45)]"
                    : "scale-[0.88] border-border opacity-50"
                }`}
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => goTo(index)}
                  aria-label={member.name ? `${member.name}, ${member.role}` : member.role}
                  aria-current={selected ? "true" : undefined}
                >
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <Portrait member={member} />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      {member.name ? (
                        <>
                          <h3 className="font-display text-sm font-semibold text-text-on-dark sm:text-base">
                            {member.name}
                          </h3>
                          <p className="mt-0.5 text-xs text-[#22c55e] sm:text-sm">{member.role}</p>
                        </>
                      ) : (
                        <h3 className="font-display text-sm font-semibold leading-snug text-text-on-dark sm:text-base">
                          {member.role}
                        </h3>
                      )}
                    </div>
                  </div>
                </button>
              </article>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-center gap-4 sm:mt-6">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-primary transition hover:border-[#22c55e]/40 hover:text-[#22c55e]"
            aria-label="Предыдущий сотрудник"
            onClick={() => goTo(active - 1)}
          >
            <Chevron dir="prev" />
          </button>
          <div className="flex items-center gap-2">
            {TEAM.map((member, index) => (
              <button
                key={member.id}
                type="button"
                aria-label={member.name ? `${member.name}, ${member.role}` : member.role}
                aria-current={index === active ? "true" : undefined}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === active ? "w-7 bg-[#22c55e]" : "w-1.5 bg-border-strong hover:bg-[#22c55e]/50"
                }`}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-primary transition hover:border-[#22c55e]/40 hover:text-[#22c55e]"
            aria-label="Следующий сотрудник"
            onClick={() => goTo(active + 1)}
          >
            <Chevron dir="next" />
          </button>
        </div>
      </div>
    </section>
  );
}
