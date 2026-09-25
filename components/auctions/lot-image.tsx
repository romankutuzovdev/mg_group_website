"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";
import { LOT_IMAGE_FALLBACK } from "@/lib/auctions/lot-image-url";

type LotImageProps = Omit<ImageProps, "src" | "alt"> & {
  src: string;
  alt: string;
};

export function LotImage({ src, alt, ...props }: LotImageProps) {
  const [url, setUrl] = useState(src);

  useEffect(() => {
    setUrl(src);
  }, [src]);

  return (
    <Image
      {...props}
      src={url}
      alt={alt}
      // Copart CDN often blocks hotlink by Referer — omit it
      referrerPolicy="no-referrer"
      onError={() => {
        if (url !== LOT_IMAGE_FALLBACK) setUrl(LOT_IMAGE_FALLBACK);
      }}
    />
  );
}
