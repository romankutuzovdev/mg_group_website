/** Neutral placeholder — never a stock car photo. */
export const LOT_IMAGE_FALLBACK = "/auctions/lots/_placeholder.svg";

/** Copart CDN hosts used for lot photos. */
export function isCopartCdnUrl(url: string): boolean {
  return /(?:c-static|cs)\.copart\.(?:com|co\.uk)/i.test(url);
}

export function isAuctionCdnUrl(url: string): boolean {
  return (
    isCopartCdnUrl(url) ||
    /iaai\.com|anvis|encar\.com|bid\.cars|cloudfront\.net|amazonaws\.com/i.test(url)
  );
}

/**
 * Absolute proxy base (Pages Function / Worker).
 * Empty → same-origin `/api/lot-image` (Windows FastAPI or CF Pages Function).
 */
function imageProxyBase(): string {
  return (process.env.NEXT_PUBLIC_CF_IMAGE_PROXY || "").trim().replace(/\/$/, "");
}

/** Rewrite auction CDN → same-origin proxy (Referer + Mixed Content safe). */
export function proxyLotImageUrl(url: string): string {
  const base = imageProxyBase();
  const qs = `u=${encodeURIComponent(url)}`;
  if (base) return `${base}?${qs}`;
  return `/api/lot-image?${qs}`;
}

/** Real auction photo — any usable http(s) or local path (not placeholder). */
export function isRealLotPhotoUrl(url: string | undefined | null): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  if (trimmed.includes("_placeholder")) return false;
  if (trimmed.startsWith("/auctions/lots/")) return true;
  if (trimmed.startsWith("/api/lot-image")) return true;
  if (/unsplash\.com/i.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return false;
}

/**
 * Normalize lot image for display.
 * Production / static site: proxy auction CDNs via `/api/lot-image` (like CF Function).
 * next dev: keep direct CDN + LotImage referrerPolicy=no-referrer.
 */
export function resolveLotImageUrl(
  url: string | undefined | null,
  _make?: string | null,
): string {
  const trimmed = url?.trim();
  if (!trimmed) return LOT_IMAGE_FALLBACK;
  if (trimmed.startsWith("/api/lot-image")) return trimmed;
  if (trimmed.startsWith("/auctions/lots/")) return trimmed;
  if (/unsplash\.com/i.test(trimmed)) return LOT_IMAGE_FALLBACK;

  if (/^https?:\/\//i.test(trimmed)) {
    const useProxy =
      process.env.NODE_ENV === "production" ||
      Boolean(imageProxyBase()) ||
      process.env.NEXT_PUBLIC_FORCE_IMAGE_PROXY === "1";
    if (useProxy) {
      return proxyLotImageUrl(trimmed);
    }
    return trimmed;
  }
  return LOT_IMAGE_FALLBACK;
}

/** Pick best display URL from lot fields, then resolve. */
export function resolveLotDisplayImage(lot: {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
}): string {
  const candidates = [
    lot.imageUrl,
    ...(Array.isArray(lot.imageUrls) ? lot.imageUrls : []),
  ]
    .map((u) => (u || "").trim())
    .filter(Boolean);
  const first = candidates[0] || "";
  return resolveLotImageUrl(first);
}
