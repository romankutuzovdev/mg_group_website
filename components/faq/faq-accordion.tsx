"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FAQ_CATEGORIES,
  FAQ_ITEMS,
  type FaqCategoryId,
  type FaqItem,
} from "@/lib/faq/content";

function AnswerBody({ item }: { item: FaqItem }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
      {item.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}

      {item.bullets && item.bullets.length > 0 ? (
        <ul className="space-y-1.5 pl-1">
          {item.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {item.afterBullets?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}

      {item.timings && item.timings.length > 0 ? (
        <dl className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-base">
          {item.timings.map((row) => (
            <div
              key={row.region}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            >
              <dt className="text-sm font-medium text-text-primary">{row.region}</dt>
              <dd className="text-sm text-text-secondary">{row.term}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {item.links && item.links.length > 0 ? (
        <ul className="flex flex-wrap gap-2 pt-1">
          {item.links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                {...(link.href.startsWith("http")
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="inline-flex rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-accent/40 hover:text-accent"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FaqAccordion() {
  const [category, setCategory] = useState<FaqCategoryId>("all");

  const items = useMemo(
    () =>
      category === "all"
        ? FAQ_ITEMS
        : FAQ_ITEMS.filter((item) => item.category === category),
    [category],
  );

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const target = FAQ_ITEMS.find((item) => item.id === hash);
    if (!target) return;

    setCategory("all");

    requestAnimationFrame(() => {
      const el = document.getElementById(hash);
      if (!(el instanceof HTMLDetailsElement)) return;
      el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          Разделы
        </p>
        <p className="mt-2 text-sm text-text-secondary">Быстрый переход по темам</p>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {FAQ_CATEGORIES.map((item) => {
            const active = item.id === category;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={`shrink-0 rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition ${
                  active
                    ? "border-accent/40 bg-accent/10 text-accent-dark"
                    : "border-border bg-bg-elevated text-text-secondary hover:border-accent/30 hover:text-text-primary"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="space-y-3">
        {items.map((item) => (
          <details
            key={item.id}
            id={item.id}
            className="group scroll-mt-28 rounded-2xl border border-border bg-bg-card open:border-accent/35"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-display text-base font-semibold tracking-tight marker:content-none [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-lg font-medium text-accent transition group-open:rotate-45 group-open:border-accent/40 group-open:bg-accent/10"
              >
                +
              </span>
            </summary>
            <div className="border-t border-border px-6 py-5">
              <AnswerBody item={item} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
