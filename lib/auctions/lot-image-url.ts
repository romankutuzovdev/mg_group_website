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
  if (trimmed.startsWith("/api/lot-photos/")) return true;
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
  if (trimmed.startsWith("/api/lot-photos/")) return trimmed;
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

/** Ads, avatars and inspection icons scraped together with the car gallery. */
const JUNK_PHOTO =
  /daimg\.encar|wt_mark|userdata\/dealer|insur_|listex|sprite|\/logo|avatar|1x1|pixel|blank\.|diagnosis\/option|diagnosis\/sellingpoint|\bicon\b/i;

function photoIdentity(url: string): string {
  const keyMatch = url.match(/[?&]imageKeys=([^&]+)/i);
  if (keyMatch) {
    try {
      return `iaai:${decodeURIComponent(keyMatch[1])}`;
    } catch {
      return `iaai:${keyMatch[1]}`;
    }
  }
  const path = url.split("?")[0];
  const base = path.split("/").pop() || "";
  if (!base || /_+$/.test(base) || base.length < 5) return "";
  return base.replace(/_(?:thb|ths|ful|hrs)(?=\.)/i, "").toLowerCase();
}

function photoScore(url: string): number {
  let score = 0;
  const rh = url.match(/[?&]rh=(\d+)/i);
  if (rh) score += Number(rh[1]);
  const width = url.match(/[?&](?:width|cw)=(\d+)/i);
  if (width) score += Number(width[1]);
  if (/_ful\./i.test(url)) score += 5000;
  else if (/_hrs\./i.test(url)) score += 4000;
  else if (/_th[sb]\./i.test(url)) score += 100;
  if (!url.includes("?")) score += 2000;
  return score;
}

/**
 * All distinct lot photos from `imageUrl` + `imageUrls`.
 * The API keeps every scraped URL (size variants, banners). The site should
 * show one frame per shot, largest first-seen variant.
 */
export function collectLotPhotoUrls(lot: {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
}): string[] {
  const raw = [lot.imageUrl, ...(Array.isArray(lot.imageUrls) ? lot.imageUrls : [])]
    .map((u) => (u || "").trim())
    .filter((u) => /^https?:\/\//i.test(u) || u.startsWith("/"));

  const best = new Map<string, { url: string; score: number }>();
  for (const url of raw) {
    if (JUNK_PHOTO.test(url) || /unsplash\.com/i.test(url)) continue;
    const id = photoIdentity(url);
    if (!id) continue;
    const score = photoScore(url);
    const prev = best.get(id);
    if (!prev || score > prev.score) best.set(id, { url, score });
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const url of raw) {
    if (JUNK_PHOTO.test(url) || /unsplash\.com/i.test(url)) continue;
    const id = photoIdentity(url);
    if (!id || seen.has(id) || !best.has(id)) continue;
    seen.add(id);
    ordered.push(best.get(id)!.url);
  }

  const resolved = Array.from(
    new Set(
      ordered
        .map((u) => resolveLotImageUrl(u))
        .filter((u) => u && !u.includes("_placeholder")),
    ),
  );
  if (resolved.length > 0) return resolved;

  const cover = resolveLotImageUrl(lot.imageUrl);
  return cover.includes("_placeholder") ? [] : [cover];
}

/** Pick best display URL from lot fields, then resolve. */
export function resolveLotDisplayImage(lot: {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
}): string {
  return collectLotPhotoUrls(lot)[0] || resolveLotImageUrl(lot.imageUrl);
}
