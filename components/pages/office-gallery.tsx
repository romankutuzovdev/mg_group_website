"use client";

import Image from "next/image";
import { useCallback, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { OFFICE_PHOTOS } from "@/lib/company";
import { cn } from "@/lib/utils";

/** Сколько фото видно в сетке до «Показать все». */
const PREVIEW_COUNT = 8;

export function OfficeGallery() {
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const count = OFFICE_PHOTOS.length;
  const visible = showAll ? OFFICE_PHOTOS : OFFICE_PHOTOS.slice(0, PREVIEW_COUNT);

  const step = useCallback(
    (delta: number) => setOpen((i) => (i === null ? i : (i + delta + count) % count)),
    [count],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") step(-1);
    if (event.key === "ArrowRight") step(1);
  };

  const current = open === null ? null : OFFICE_PHOTOS[open];

  return (
    <section className="mt-16" aria-labelledby="office-gallery-title">
      <h2 id="office-gallery-title" className="font-display text-2xl font-semibold">
        Наш офис
      </h2>
      <p className="mt-3 max-w-2xl text-text-secondary">
        Приезжайте на консультацию: обсудим подбор, доставку и расчёт лично.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {visible.map((photo, index) => (
          <button
            key={photo.src}
            type="button"
            onClick={() => setOpen(index)}
            aria-label={`Открыть фото: ${photo.alt}`}
            className={cn(
              "group relative aspect-[4/3] overflow-hidden rounded-2xl bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              index === 0 && "col-span-2 lg:row-span-2 lg:aspect-auto",
            )}
          >
            <Image
              src={photo.thumb}
              alt={photo.alt}
              fill
              loading={index === 0 ? "eager" : "lazy"}
              sizes={index === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {count > PREVIEW_COUNT ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-full border border-border px-5 py-2 text-sm font-medium text-text-primary transition-colors hover:border-accent hover:text-accent-dark"
          >
            {showAll ? "Свернуть" : `Показать все фото (${count})`}
          </button>
        </div>
      ) : null}

      <Dialog open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
          className="max-w-5xl border-none bg-transparent p-0 shadow-none [&>button]:right-2 [&>button]:top-2 [&>button]:z-10 [&>button]:rounded-full [&>button]:bg-black/60 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-100"
        >
          <DialogTitle className="sr-only">{current?.alt ?? "Фото офиса"}</DialogTitle>
          {current && (
            <div
              className={cn(
                "relative mx-auto max-h-[85vh] overflow-hidden rounded-2xl bg-black",
                current.portrait ? "aspect-[2/3] h-[85vh] max-w-full" : "aspect-[3/2] w-full",
              )}
            >
              <Image src={current.src} alt={current.alt} fill sizes="100vw" className="object-contain" />
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Предыдущее фото"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Следующее фото"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                {(open ?? 0) + 1} / {count}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
