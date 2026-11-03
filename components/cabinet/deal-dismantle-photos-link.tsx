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
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-zinc-900">Фото разбора</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
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
            className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] font-medium text-zinc-900 transition hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <span className="min-w-0 truncate">{href}</span>
            <span className="shrink-0 text-xs font-medium text-emerald-700">
              Открыть →
            </span>
          </a>
        ) : (
          <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-6 text-center text-[13px] text-zinc-500">
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
                className="mt-1.5 h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-[13px] shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
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
              className="inline-flex h-8 items-center rounded-md bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
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
