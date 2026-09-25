"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { LOT_IMAGE_FALLBACK } from "@/lib/auctions/lot-image-url";
import { cn } from "@/lib/utils";

type LotImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
};

/** Stable <img> for static export + auction CDNs (next/image domain list is incomplete). */
export function LotImage({
  src,
  alt,
  fill,
  priority,
  className,
  sizes,
  ...props
}: LotImageProps) {
  const [url, setUrl] = useState(src);

  useEffect(() => {
    setUrl(src);
  }, [src]);

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...props}
        src={url}
        alt={alt}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        referrerPolicy="no-referrer"
        className={cn("absolute inset-0 h-full w-full", className)}
        onError={() => {
          if (url !== LOT_IMAGE_FALLBACK) setUrl(LOT_IMAGE_FALLBACK);
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      src={url}
      alt={alt}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      className={className}
      onError={() => {
        if (url !== LOT_IMAGE_FALLBACK) setUrl(LOT_IMAGE_FALLBACK);
      }}
    />
  );
}
