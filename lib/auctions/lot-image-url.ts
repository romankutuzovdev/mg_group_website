/** Neutral placeholder — never a stock car photo. */
export const LOT_IMAGE_FALLBACK = "/auctions/lots/_placeholder.svg";

/** Copart CDN hosts used for lot photos. */
export function isCopartCdnUrl(url: string): boolean {
  return /(?:c-static|cs)\.copart\.(?:com|co\.uk)/i.test(url);
}

/**
 * Absolute proxy base (Pages Function / Worker).
 * Empty → use Copart CDN directly (works for `<img>`; local `next dev` has no Pages Functions).
 */
function imageProxyBase(): string {
  return (process.env.NEXT_PUBLIC_CF_IMAGE_PROXY || "").trim().replace(/\/$/, "");
}

/** Rewrite Copart CDN → CF proxy when NEXT_PUBLIC_CF_IMAGE_PROXY is set. */
export function proxyLotImageUrl(url: string): string {
  const base = imageProxyBase();
  const qs = `u=${encodeURIComponent(url)}`;
  if (base) return `${base}?${qs}`;
  // Same-origin Pages Function path (production only — not available in `next dev`).
  return `/api/lot-image?${qs}`;
}

/** Real auction photo: local file, Bid.cars, or Copart CDN. */
export function isRealLotPhotoUrl(url: string | undefined | null): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/auctions/lots/") && !trimmed.includes("_placeholder")) return true;
  if (/bid\.cars/i.test(trimmed)) return true;
  if (isCopartCdnUrl(trimmed)) return true;
  if (trimmed.startsWith("/api/lot-image")) return true;
  if (/unsplash\.com/i.test(trimmed)) return false;
  return false;
}

/**
 * Local `/auctions/lots/...` and Bid.cars kept as-is.
 * Copart CDN: direct URL by default (CDN allows hotlinking).
 * Set NEXT_PUBLIC_CF_IMAGE_PROXY to force the Cloudflare image proxy.
 */
export function resolveLotImageUrl(
  url: string | undefined | null,
  _make?: string | null,
): string {
  const trimmed = url?.trim();
  if (!trimmed) return LOT_IMAGE_FALLBACK;
  if (trimmed.startsWith("/api/lot-image")) return trimmed;
  if (trimmed.startsWith("/auctions/lots/")) return trimmed;
  if (/bid\.cars/i.test(trimmed)) return trimmed;
  if (isCopartCdnUrl(trimmed)) {
    // Only proxy when an absolute proxy URL is configured (e.g. local → pages.dev).
    // Default to direct CDN so `next dev` and static hosts without Functions still work.
    if (imageProxyBase()) return proxyLotImageUrl(trimmed);
    return trimmed;
  }
  if (/unsplash\.com/i.test(trimmed)) return LOT_IMAGE_FALLBACK;
  return LOT_IMAGE_FALLBACK;
}
