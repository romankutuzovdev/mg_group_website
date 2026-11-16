"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { OFFICE_PHOTOS } from "@/lib/company";
import { cn } from "@/lib/utils";

/** Сколько плиток в мозаике до «Показать все» — ровно заполняет сетку на десктопе. */
const PREVIEW_COUNT = 11;
const EASE = [0.22, 1, 0.36, 1] as const;

type Photo = (typeof OFFICE_PHOTOS)[number];

/** Размер плитки в мозаике: первая большая, вертикальные высокие, каждая 6-я широкая. */
function tileSpan(photo: Photo, index: number) {
  if (index === 0) return "col-span-2 row-span-2";
  if (photo.portrait) return "row-span-2";
  if (index % 6 === 4) return "col-span-2";
  return "";
}

export function OfficeGallery() {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const count = OFFICE_PHOTOS.length;
  const visible = showAll ? OFFICE_PHOTOS : OFFICE_PHOTOS.slice(0, PREVIEW_COUNT);

  return (
    <section className="mt-20" aria-labelledby="office-gallery-title">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent-dark">
            MG.GROUP изнутри
          </p>
          <h2 id="office-gallery-title" className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
            Наш офис
          </h2>
          <p className="mt-3 max-w-xl text-text-secondary">
            Приезжайте на консультацию: обсудим подбор, доставку и расчёт лично.
          </p>
        </div>
        <span className="rounded-full border border-border bg-white px-4 py-1.5 text-sm font-medium text-text-secondary">
          {count} фото
        </span>
      </motion.div>

      <div className="mt-8 grid grid-flow-row-dense auto-rows-[130px] grid-cols-2 gap-2.5 sm:auto-rows-[170px] sm:gap-3 md:grid-cols-3 lg:auto-rows-[190px] lg:grid-cols-4 lg:gap-4">
        {visible.map((photo, index) => (
          <motion.button
            key={photo.src}
            type="button"
            onClick={() => setOpen(index)}
            aria-label={`Открыть фото: ${photo.alt}`}
            initial={
              reduceMotion
                ? false
                : { opacity: 0, y: 28, scale: 0.94, clipPath: "inset(14% 14% 14% 14% round 24px)" }
            }
            whileInView={{ opacity: 1, y: 0, scale: 1, clipPath: "inset(0% 0% 0% 0% round 16px)" }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{
              duration: 0.8,
              ease: EASE,
              // По очереди внутри каждой «пачки», чтобы догруженные фото тоже шли волной.
              delay: (index < PREVIEW_COUNT ? index : (index - PREVIEW_COUNT) % 8) * 0.07,
            }}
            className={cn(
              "group relative overflow-hidden rounded-2xl bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
              tileSpan(photo, index),
            )}
          >
            <Image
              src={photo.thumb}
              alt={photo.alt}
              fill
              loading={index < 3 ? "eager" : "lazy"}
              sizes={index === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
            />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100" />
            <span className="pointer-events-none absolute bottom-3 right-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-white/90 text-text-primary opacity-0 shadow-lg backdrop-blur transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </span>
          </motion.button>
        ))}
      </div>

      {count > PREVIEW_COUNT ? (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-white px-6 py-3 text-sm font-semibold text-text-primary shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
          >
            {showAll ? "Свернуть галерею" : `Смотреть все ${count} фото`}
            <ChevronRight
              className={cn("h-4 w-4 text-accent-dark transition-transform", showAll ? "-rotate-90" : "rotate-90")}
              aria-hidden="true"
            />
          </button>
        </div>
      ) : null}

      <Lightbox index={open} onIndexChange={setOpen} reduceMotion={!!reduceMotion} />
    </section>
  );
}

function Lightbox({
  index,
  onIndexChange,
  reduceMotion,
}: {
  index: number | null;
  onIndexChange: (i: number | null) => void;
  reduceMotion: boolean;
}) {
  const count = OFFICE_PHOTOS.length;
  const [direction, setDirection] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      setDirection(delta);
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  const jump = (target: number) => {
    if (index === null || target === index) return;
    setDirection(target > index ? 1 : -1);
    onIndexChange(target);
  };

  // Держим активную миниатюру в центре плёнки.
  useEffect(() => {
    if (index === null) return;
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
  }, [index, reduceMotion]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) go(1);
    else if (info.offset.x > 60 || info.velocity.x > 400) go(-1);
  };

  const current = index === null ? null : OFFICE_PHOTOS[index];
  const neighbours =
    index === null ? [] : [OFFICE_PHOTOS[(index + 1) % count], OFFICE_PHOTOS[(index - 1 + count) % count]];

  return (
    <DialogPrimitive.Root open={index !== null} onOpenChange={(v) => !v && onIndexChange(null)}>
      <AnimatePresence>
        {index !== null && current ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[200] bg-stone-950/95 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              asChild
              forceMount
              aria-describedby={undefined}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") go(-1);
                if (e.key === "ArrowRight") go(1);
              }}
            >
              <motion.div
                className="fixed inset-0 z-[200] flex flex-col focus:outline-none"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <DialogPrimitive.Title className="sr-only">{current.alt}</DialogPrimitive.Title>

                <div className="flex items-center justify-between px-4 pt-4 text-white sm:px-6">
                  <span className="font-display text-sm tabular-nums text-white/80">
                    <span className="text-lg font-semibold text-white">{String(index + 1).padStart(2, "0")}</span>
                    {" / "}
                    {String(count).padStart(2, "0")}
                  </span>
                  <DialogPrimitive.Close
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label="Закрыть"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </DialogPrimitive.Close>
                </div>

                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-4 sm:px-20">
                  <AnimatePresence initial={false} custom={direction} mode="popLayout">
                    <motion.div
                      key={current.src}
                      custom={direction}
                      variants={{
                        enter: (d: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, x: d * 80, scale: 0.98 }),
                        center: { opacity: 1, x: 0, scale: 1 },
                        exit: (d: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, x: d * -80, scale: 0.98 }),
                      }}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.45, ease: EASE }}
                      drag={reduceMotion ? false : "x"}
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.25}
                      onDragEnd={onDragEnd}
                      className="relative h-full w-full max-w-6xl cursor-grab active:cursor-grabbing"
                    >
                      <Image
                        src={current.src}
                        alt={current.alt}
                        fill
                        sizes="100vw"
                        draggable={false}
                        priority
                        className="select-none object-contain"
                      />
                    </motion.div>
                  </AnimatePresence>

                  <NavButton side="left" onClick={() => go(-1)} />
                  <NavButton side="right" onClick={() => go(1)} />
                </div>

                <div
                  ref={stripRef}
                  className="overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
                >
                  <div className="mx-auto flex w-max gap-2">
                  {OFFICE_PHOTOS.map((photo, i) => (
                    <button
                      key={photo.thumb}
                      type="button"
                      data-index={i}
                      onClick={() => jump(i)}
                      aria-label={`Фото ${i + 1}`}
                      aria-current={i === index ? "true" : undefined}
                      className={cn(
                        "relative h-14 w-20 shrink-0 overflow-hidden rounded-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                        i === index ? "opacity-100 ring-2 ring-accent" : "opacity-40 hover:opacity-80",
                      )}
                    >
                      <Image src={photo.thumb} alt="" fill sizes="80px" loading="lazy" className="object-cover" />
                    </button>
                  ))}
                  </div>
                </div>

                {/* Прогрев соседних кадров, чтобы листание было мгновенным. */}
                <div className="hidden" aria-hidden="true">
                  {neighbours.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.src} src={p.src} alt="" />
                  ))}
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Предыдущее фото" : "Следующее фото"}
      className={cn(
        "absolute top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-all hover:scale-105 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:flex",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      <Icon className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}
