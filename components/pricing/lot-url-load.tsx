"use client";

import { useEffect, useState } from "react";

const LOAD_STEPS = ["Открываем ссылку", "Ищем лот", "Читаем ставку и площадку"];

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
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-70"
    >
      {loading ? (
        <>
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
            aria-hidden
          />
          Загружаем
        </>
      ) : (
        "Загрузить лот"
      )}
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
    }, 1400);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <div className="mt-2 space-y-1.5" role="status" aria-live="polite">
      <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${((step + 1) / LOAD_STEPS.length) * 100}%` }}
        />
      </div>
      <p className="flex items-center gap-2 text-xs font-normal normal-case tracking-normal text-text-secondary">
        <span
          className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
          aria-hidden
        />
        {LOAD_STEPS[step]}…
      </p>
    </div>
  );
}
