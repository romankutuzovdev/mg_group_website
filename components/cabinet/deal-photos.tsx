"use client";

import { useRef, useState } from "react";
import type { Deal, DealMedia } from "@/lib/api/cabinet";
import {
  adminUploadDealMedia,
  fetchMyDeal,
  mediaAbsoluteUrl,
} from "@/lib/api/cabinet";

type Props = {
  deal: Deal;
  isAdmin?: boolean;
  onUpdated?: (deal: Deal) => void;
};

export function DealPhotos({ deal, isAdmin = false, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<DealMedia | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const photos = (deal.media || []).filter((m) => m.kind === "photo");

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) continue;
          await adminUploadDealMedia(deal.id, file);
        }
        const next = await fetchMyDeal(deal.id);
        onUpdated?.(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить фото");
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <section className="rounded-xl border border-border bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Фото авто</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {photos.length
              ? `${photos.length} фото`
              : isAdmin
                ? "Загрузите фото — клиент увидит их в кабинете"
                : "Пока нет фото"}
          </p>
        </div>
        {isAdmin ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                upload(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 sm:min-h-0"
            >
              {busy ? "Загрузка…" : "+ Добавить фото"}
            </button>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {photos.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => {
            const src = mediaAbsoluteUrl(photo.url);
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setLightbox(photo)}
                  className="block w-full overflow-hidden rounded-xl border border-border bg-zinc-50 text-left transition hover:border-emerald-400/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={photo.caption || photo.filename || "Фото авто"}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-8 text-center text-xs text-zinc-400">
          {isAdmin ? "Нажмите «Добавить фото», чтобы загрузить снимки" : "Фото появятся здесь"}
        </div>
      )}

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3"
          role="dialog"
          aria-modal
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-3 top-3 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-zinc-900"
            onClick={() => setLightbox(null)}
          >
            Закрыть
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaAbsoluteUrl(lightbox.url)}
            alt={lightbox.caption || lightbox.filename || "Фото"}
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}

/** First photo URL for list thumbnails, or null. */
export function dealCoverPhotoUrl(deal: Deal): string | null {
  const photo = (deal.media || []).find((m) => m.kind === "photo");
  return photo ? mediaAbsoluteUrl(photo.url) : null;
}
