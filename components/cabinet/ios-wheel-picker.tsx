"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  value: string;
  onCommit: (next: string) => void;
  min?: number;
  max?: number;
  readOnly?: boolean;
  ariaLabel?: string;
};

function parseQty(value: string, min: number, max: number): number | null {
  const n = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** iPhone-timer style drum for picking a quantity. */
export function IosWheelPicker({
  value,
  onCommit,
  min = 0,
  max = 20,
  readOnly,
  ariaLabel = "Количество",
}: Props) {
  const selected = parseQty(value, min, max);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selected ?? min);
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemH = 44;
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) setDraft(selected ?? min);
  }, [open, selected, min]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current;
    const y = (draft - min) * itemH;
    el.scrollTop = y;
  }, [open, draft, min]);

  const close = (commit: boolean) => {
    if (commit && !readOnly) onCommit(String(draft));
    setOpen(false);
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / itemH);
    const next = Math.min(max, Math.max(min, min + idx));
    if (next !== draft) setDraft(next);
  };

  const snap = () => {
    const el = listRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / itemH);
    const next = Math.min(max, Math.max(min, min + idx));
    el.scrollTo({ top: (next - min) * itemH, behavior: "smooth" });
    setDraft(next);
  };

  return (
    <>
      <button
        type="button"
        disabled={readOnly}
        aria-label={ariaLabel}
        onClick={() => {
          if (readOnly) return;
          setOpen(true);
        }}
        className={[
          "flex w-full min-h-11 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 py-2.5 text-base font-semibold tabular-nums text-zinc-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 sm:min-h-0 sm:rounded-md sm:py-1.5 sm:text-sm",
          readOnly ? "cursor-default bg-zinc-50 text-zinc-700" : "hover:bg-zinc-50 active:bg-zinc-100",
        ].join(" ")}
      >
        {selected == null ? "—" : selected}
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              onClick={() => close(false)}
            >
              <div
                className="w-full max-w-sm overflow-hidden rounded-t-2xl bg-[#f2f2f7] shadow-2xl sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
                  <button
                    type="button"
                    className="text-[17px] font-normal text-[#007aff]"
                    onClick={() => close(false)}
                  >
                    Отмена
                  </button>
                  <span className="text-[15px] font-semibold text-zinc-900">{ariaLabel}</span>
                  <button
                    type="button"
                    className="text-[17px] font-semibold text-[#007aff]"
                    onClick={() => close(true)}
                  >
                    Готово
                  </button>
                </div>

                <div className="relative px-6 py-4">
                  <div
                    className="pointer-events-none absolute inset-x-6 top-1/2 z-10 h-11 -translate-y-1/2 rounded-lg bg-black/[0.06]"
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-[#f2f2f7] to-transparent"
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-16 bg-gradient-to-t from-[#f2f2f7] to-transparent"
                    aria-hidden
                  />
                  <div
                    ref={listRef}
                    onScroll={onScroll}
                    onTouchEnd={snap}
                    onMouseUp={snap}
                    className="relative z-0 h-[220px] overflow-y-auto overscroll-contain scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    style={{
                      scrollSnapType: "y mandatory",
                      paddingTop: 88,
                      paddingBottom: 88,
                    }}
                  >
                    {options.map((n) => (
                      <div
                        key={n}
                        className={[
                          "flex h-11 items-center justify-center text-[22px] tabular-nums transition-colors",
                          n === draft
                            ? "font-semibold text-zinc-900"
                            : "font-normal text-zinc-400",
                        ].join(" ")}
                        style={{ scrollSnapAlign: "center", height: itemH }}
                        onClick={() => {
                          setDraft(n);
                          listRef.current?.scrollTo({
                            top: (n - min) * itemH,
                            behavior: "smooth",
                          });
                        }}
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
