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
 * Flags / icons scraped into galleries (www.copart.com/content/us.svg etc.).
 * Not car photos — proxy rejects www.copart.com → 403, and they slow the grid.
 */
export function isJunkLotImageUrl(url: string): boolean {
  const u = (url || "").trim();
  if (!u) return true;
  if (/unsplash\.com/i.test(u)) return true;
  if (/\.svg(?:$|\?)/i.test(u)) return true;
  if (/\/content\/[a-z]{2}\.svg/i.test(u)) return true;
  if (/www\.copart\.(?:com|co\.uk)\/content\//i.test(u)) return true;
  if (
    /daimg\.encar|wt_mark|userdata\/dealer|insur_|listex|sprite|\/logo|avatar|1x1|pixel|blank\.|diagnosis\/option|diagnosis\/sellingpoint|\bicon\b|\bflag\b/i.test(
      u,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Copart object storage is public (CORS *) and works with referrerPolicy=no-referrer.
 * Proxying via Windows API doubles latency and often returns 502 when outbound is blocked.
 */
function shouldProxyAuctionUrl(url: string): boolean {
  if (isCopartCdnUrl(url)) return false;
  if (/images\.bid\.cars|cdn\.bid\.cars|mercury\.bid\.cars/i.test(url)) return false;
  // IAAI / Encar often hotlink-protect — keep same-origin proxy.
  return /iaai\.com|anvis|encar\.com|cloudfront\.net|amazonaws\.com/i.test(url);
}

/**
 * Normalize lot image for display.
 * Copart/Bid.cars: direct CDN. IAAI/Encar: `/api/lot-image` proxy.
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
  if (isJunkLotImageUrl(trimmed)) return LOT_IMAGE_FALLBACK;

  if (/^https?:\/\//i.test(trimmed)) {
    const useProxy =
      (process.env.NODE_ENV === "production" ||
        Boolean(imageProxyBase()) ||
        process.env.NEXT_PUBLIC_FORCE_IMAGE_PROXY === "1") &&
      shouldProxyAuctionUrl(trimmed);
    if (useProxy) {
      return proxyLotImageUrl(trimmed);
    }
    return trimmed;
  }
  return LOT_IMAGE_FALLBACK;
}

/** Smaller Copart thumb for catalog cards (faster than _ful). */
export function toLotThumbUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return raw;
  // Unwrap proxy so we can rewrite size, then resolve again.
  let target = raw;
  const proxied = raw.match(/[?&]u=([^&]+)/);
  if (raw.includes("/api/lot-image") && proxied) {
    try {
      target = decodeURIComponent(proxied[1]);
    } catch {
      return raw;
    }
  }
  if (isCopartCdnUrl(target)) {
    const thumb = target.replace(/_(?:ful|hrs)\./i, "_thb.");
    return resolveLotImageUrl(thumb);
  }
  return resolveLotImageUrl(target);
}

/** Hero / main photo — Copart mid-res (_hrs), not huge _ful. */
export function toLotHeroUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return LOT_IMAGE_FALLBACK;
  let target = raw;
  const proxied = raw.match(/[?&]u=([^&]+)/);
  if (raw.includes("/api/lot-image") && proxied) {
    try {
      target = decodeURIComponent(proxied[1]);
    } catch {
      return resolveLotImageUrl(raw);
    }
  }
  if (isCopartCdnUrl(target)) {
    const mid = target.replace(/_th[sb]\./i, "_hrs.").replace(/_ful\./i, "_hrs.");
    return resolveLotImageUrl(mid);
  }
  return resolveLotImageUrl(raw);
}

function photoIdentity(url: string): string {
  if (url.startsWith("/api/lot-photos/")) {
    const base = (url.split("/").pop() || "").replace(/\.[^.]+$/, "");
    // 01-abc123def456 → prefer hash part
    const hash = base.replace(/^\d+-/, "");
    return hash ? `local:${hash}` : `local:${base}`;
  }
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
  // Prefer direct Copart/Bid.cars CDN — Vercel→Windows /api/lot-photos is slow.
  if (isCopartCdnUrl(url)) score += 30_000;
  else if (/images\.bid\.cars|cdn\.bid\.cars|mercury\.bid\.cars/i.test(url)) score += 28_000;
  else if (url.startsWith("/api/lot-photos/")) score += 12_000;
  else if (url.startsWith("/api/lot-image")) score += 8_000;
  else if (/^https?:\/\//i.test(url)) score += 10_000;

  const rh = url.match(/[?&]rh=(\d+)/i);
  if (rh) score += Number(rh[1]);
  const width = url.match(/[?&](?:width|cw)=(\d+)/i);
  if (width) score += Number(width[1]);
  // Mid-res for display; full _ful is heavy for grids
  if (/_hrs\./i.test(url)) score += 5000;
  else if (/_ful\./i.test(url)) score += 4200;
  else if (/_th[sb]\./i.test(url)) score += 800;
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
    if (isJunkLotImageUrl(url)) continue;
    const id = photoIdentity(url);
    if (!id) continue;
    const score = photoScore(url);
    const prev = best.get(id);
    if (!prev || score > prev.score) best.set(id, { url, score });
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const url of raw) {
    if (isJunkLotImageUrl(url)) continue;
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

/** Catalog card cover — prefer thumb size for speed. */
export function resolveLotCardImage(lot: {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
}): string {
  const photos = collectLotPhotoUrls(lot);
  if (!photos.length) return LOT_IMAGE_FALLBACK;
  return toLotThumbUrl(photos[0]);
}

/** Pick best display URL from lot fields, then resolve. */
export function resolveLotDisplayImage(lot: {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
}): string {
  return collectLotPhotoUrls(lot)[0] || resolveLotImageUrl(lot.imageUrl);
}
