"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { Car } from "lucide-react";
import { LOT_IMAGE_FALLBACK } from "@/lib/auctions/lot-image-url";
import { cn } from "@/lib/utils";

type LotImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  /** Placeholder colours for dark panels. */
  tone?: "light" | "dark";
};

function PhotoPlaceholder({ tone }: { tone: "light" | "dark" }) {
  return (
    <div
      role="status"
      aria-label="Фото загружается"
      className={cn(
        "lot-photo-placeholder absolute inset-0 flex flex-col items-center justify-center gap-1.5 overflow-hidden [container-type:inline-size]",
        tone === "dark" ? "bg-zinc-800 text-zinc-200" : "bg-zinc-100 text-zinc-500",
      )}
    >
      <Car className="h-7 w-7" strokeWidth={1.5} aria-hidden />
      <span className="hidden text-xs font-medium [@container(min-width:140px)]:block">
        Фото загружается
      </span>
    </div>
  );
}

/** Stable <img> for static export + auction CDNs (next/image domain list is incomplete). */
export function LotImage({
  src,
  alt,
  fill,
  priority,
  className,
  sizes,
  loading,
  decoding = "async",
  tone = "light",
  ...props
}: LotImageProps) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const hasPhoto = Boolean(src) && src !== LOT_IMAGE_FALLBACK;

  useEffect(() => {
    // A server-rendered image can finish before React attaches onLoad.
    const img = ref.current;
    setLoaded(Boolean(img?.complete && img.naturalWidth > 0));
  }, [src]);

  const load = loading ?? (priority ? "eager" : "lazy");
  const image = hasPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      ref={ref}
      src={src}
      alt={alt}
      sizes={sizes}
      loading={load}
      decoding={decoding}
      fetchPriority={priority ? "high" : "auto"}
      referrerPolicy="no-referrer"
      className={cn(fill && "absolute inset-0 h-full w-full", className)}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(false)}
    />
  ) : null;

  if (!fill) return image;

  return (
    <>
      {image}
      {loaded ? null : <PhotoPlaceholder tone={tone} />}
    </>
  );
}
