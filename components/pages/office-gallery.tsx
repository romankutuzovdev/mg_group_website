"use client";

import Image from "next/image";
import { useCallback, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { OFFICE_PHOTOS } from "@/lib/company";
import { cn } from "@/lib/utils";

export function OfficeGallery() {
  const [open, setOpen] = useState<number | null>(null);
  const count = OFFICE_PHOTOS.length;

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
        {OFFICE_PHOTOS.map((photo, index) => (
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
              src={photo.src}
              alt={photo.alt}
              fill
              sizes={index === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      <Dialog open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
          className="max-w-5xl border-none bg-transparent p-0 shadow-none [&>button]:right-2 [&>button]:top-2 [&>button]:z-10 [&>button]:rounded-full [&>button]:bg-black/60 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-100"
        >
          <DialogTitle className="sr-only">{current?.alt ?? "Фото офиса"}</DialogTitle>
          {current && (
            <div className="relative aspect-[3/2] max-h-[85vh] w-full overflow-hidden rounded-2xl bg-black">
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
