"use client";

import { useEffect, useState } from "react";

const LOAD_STEPS = [
  "Открываем лот",
  "Загружаем данные лота",
  "Читаем ставку и площадку",
];

export function lotLoadErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Не удалось открыть лот";
  const cleaned = raw
    .replace(/\(каталог \+ Chrome\)/gi, "")
    .replace(/Google Chrome/gi, "")
    .replace(/Chrome CDP/gi, "")
    .replace(/headless/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,:;)])/g, "$1")
    .trim();
  return cleaned || "Не удалось открыть лот";
}

export function LotLoadButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-80"
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground"
          aria-hidden
        />
      ) : null}
      {loading ? "Загружаем лот" : "Загрузить лот"}
    </button>
  );
}

export function LotLoadStatus({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) {
      setStep(0);
      return;
    }
    const id = window.setInterval(() => {
      setStep((current) => (current + 1) % LOAD_STEPS.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="mt-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5"
      role="status"
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-sm font-medium normal-case tracking-normal text-text-primary">
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
          aria-hidden
        />
        Лот загружается
      </p>
      <p className="mt-1 pl-6 text-xs font-normal normal-case tracking-normal text-text-secondary">
        {LOAD_STEPS[step]}…
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15" aria-hidden>
        <div
          className="h-full w-1/3 rounded-full bg-primary"
          style={{ animation: "lot-load-slide 1.35s ease-in-out infinite" }}
        />
      </div>
    </div>
  );
}
