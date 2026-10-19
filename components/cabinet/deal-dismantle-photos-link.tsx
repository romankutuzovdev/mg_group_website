"use client";

import { useEffect, useState } from "react";
import type { Deal } from "@/lib/api/cabinet";
import { adminUpdateDeal, dealKind } from "@/lib/api/cabinet";

type Props = {
  deal: Deal;
  isManager?: boolean;
  onUpdated?: (deal: Deal) => void;
};

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Машинокомплект: ссылка на Dropbox (или др.) с фото разбора. */
export function DealDismantlePhotosLink({
  deal,
  isManager = false,
  onUpdated,
}: Props) {
  const isKit = dealKind(deal) === "kit";
  const [url, setUrl] = useState(deal.dismantle_photos_url || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setUrl(deal.dismantle_photos_url || "");
    setError(null);
    setOk(null);
  }, [deal.id, deal.dismantle_photos_url]);

  if (!isKit) return null;

  const href = normalizeUrl(deal.dismantle_photos_url || "");

  const save = async () => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const next = await adminUpdateDeal(deal.id, {
        dismantle_photos_url: normalizeUrl(url),
      });
      setUrl(next.dismantle_photos_url || "");
      setOk("Ссылка сохранена");
      onUpdated?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="border-b border-zinc-100 bg-gradient-to-br from-zinc-50 to-amber-50/50 px-4 py-3.5 sm:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-900/70">
          Разбор
        </p>
        <h3 className="mt-0.5 text-base font-semibold text-zinc-900 sm:text-lg">
          Фото разбора
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          {isManager
            ? "Вставьте ссылку на Dropbox (или другой диск) с фотографиями разбора."
            : "Откройте ссылку — там фотографии разбора вашего комплекта."}
        </p>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-50"
          >
            <span className="min-w-0 truncate">{href}</span>
            <span className="shrink-0 text-xs font-semibold text-amber-800">
              Открыть →
            </span>
          </a>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500">
            {isManager
              ? "Ссылка ещё не добавлена"
              : "Менеджер пока не добавил ссылку на фото разбора"}
          </p>
        )}

        {isManager ? (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-500">
              Ссылка на Dropbox / диск
              <input
                className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none ring-amber-500/30 transition focus:bg-white focus:ring-2"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.dropbox.com/…"
                inputMode="url"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {busy ? "Сохраняем…" : "Сохранить ссылку"}
            </button>
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            {ok ? <p className="text-xs text-emerald-700">{ok}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
