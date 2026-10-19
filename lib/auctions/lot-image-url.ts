/** Neutral placeholder — never a stock car photo. */
export const LOT_IMAGE_FALLBACK = "/auctions/lots/_placeholder.svg";

/** Copart CDN hosts used for lot photos. */
export function isCopartCdnUrl(url: string): boolean {
  return /(?:c-static|cs)\.copart\.(?:com|co\.uk)/i.test(url);
}

export function isAuctionCdnUrl(url: string): boolean {
  return (
    isCopartCdnUrl(url) ||
    /iaai\.com|anvis|encar\.com|bid\.cars|autoimg\.cn|che168\.com|autohome\.com|cloudfront\.net|amazonaws\.com/i.test(
      url,
    )
  );
}

/** Our Cloudflare R2 / custom photo CDN — never proxy through Windows. */
export function isOurPhotoCdnUrl(url: string): boolean {
  const u = (url || "").trim();
  if (!u.startsWith("http")) return false;
  if (/\.r2\.dev\//i.test(u)) return true;
  if (/\/lots\/[^/]+\/[^/]+\.(?:jpe?g|webp|png)(?:$|\?)/i.test(u) && !isAuctionCdnUrl(u)) {
    // Custom domain like img.mg-group.by/lots/...
    try {
      const host = new URL(u).hostname.toLowerCase();
      if (host === "img.mg-group.by" || host.endsWith(".mg-group.by")) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
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
    /daimg\.encar|wt_mark|userdata\/dealer|insur_|listex|sprite|\/logo|avatar|1x1|pixel|blank\.|diagnosis\/option|diagnosis\/sellingpoint|\bicon\b|\bflag\b|bid\.cars\/img\/|\/upd\/map\/|opineo|rating\.png|\/contact\/people\/|gstatic|googleusercontent/i.test(
      u,
    )
  ) {
    return true;
  }
  // Bid.cars car shots live on the image CDN. Page chrome (maps, badges) does not.
  if (/bid\.cars|bid\.car/i.test(u) && !/images\.bid\.cars|pluto\.bid\.car|cdn\.bid\.cars|mercury\.bid/i.test(u)) {
    return true;
  }
  return false;
}

/**
 * Auction CDNs (Copart / IAAI / Encar / Bid.cars) are often unreachable from BY
 * without a VPN. Always route them through same-origin `/api/lot-image`
 * (Vercel → Windows API, which has outbound/VPN). Direct `<img src=cdn>` breaks
 * for visitors without VPN.
 */
function shouldProxyAuctionUrl(url: string): boolean {
  return isAuctionCdnUrl(url);
}

function unwrapProxiedUrl(raw: string): string {
  const proxied = raw.match(/[?&]u=([^&]+)/);
  if (raw.includes("/api/lot-image") && proxied) {
    try {
      return decodeURIComponent(proxied[1]);
    } catch {
      return raw;
    }
  }
  return raw;
}

/** Rewrite IAAI resizer width/height (catalog thumbs vs hero). */
function rewriteIaaiSize(url: string, width: number, height: number): string {
  let u = url;
  if (/[?&]width=/i.test(u)) u = u.replace(/([?&]width=)\d+/i, `$1${width}`);
  else u += `${u.includes("?") ? "&" : "?"}width=${width}`;
  if (/[?&]height=/i.test(u)) u = u.replace(/([?&]height=)\d+/i, `$1${height}`);
  else u += `&height=${height}`;
  return u;
}

/**
 * Normalize lot image for display.
 * Production: auction CDNs → `/api/lot-image` (works without client VPN).
 * Prefer already-archived `/api/lot-photos/...` when the lot has them.
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
    // Our R2 CDN — direct, no Windows proxy hop.
    if (isOurPhotoCdnUrl(trimmed)) return trimmed;
    // Always same-origin proxy for auction CDNs (BY visitors + local next
    // rewrite → Windows cache). Direct CDN is slow/blocked without VPN.
    if (shouldProxyAuctionUrl(trimmed) || Boolean(imageProxyBase())) {
      return proxyLotImageUrl(trimmed);
    }
    return trimmed;
  }
  return LOT_IMAGE_FALLBACK;
}

/** Smaller thumb for catalog cards (local archive / Copart _thb / IAAI 320px). */
export function toLotThumbUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return raw;
  const target = unwrapProxiedUrl(raw);
  // Local archives are already JPEG-compressed on Windows; list API may already
  // point at *-th.jpg. Don't invent a -th path (404 → empty card).
  if (target.startsWith("/api/lot-photos/") || isOurPhotoCdnUrl(target)) {
    return target;
  }
  if (isCopartCdnUrl(target)) {
    const thumb = target.replace(/_(?:ful|hrs)\./i, "_thb.");
    return resolveLotImageUrl(thumb);
  }
  if (/vis\.iaai\.com/i.test(target)) {
    return resolveLotImageUrl(rewriteIaaiSize(target, 320, 240));
  }
  return resolveLotImageUrl(target);
}

/** Hero / main photo — Copart mid-res (_hrs), IAAI ~640px. */
export function toLotHeroUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return LOT_IMAGE_FALLBACK;
  const target = unwrapProxiedUrl(raw);
  if (isCopartCdnUrl(target)) {
    const mid = target.replace(/_th[sb]\./i, "_hrs.").replace(/_ful\./i, "_hrs.");
    return resolveLotImageUrl(mid);
  }
  if (/vis\.iaai\.com/i.test(target)) {
    return resolveLotImageUrl(rewriteIaaiSize(target, 640, 480));
  }
  return resolveLotImageUrl(target);
}

function photoIdentity(url: string): string {
  if (url.startsWith("/api/lot-photos/") || isOurPhotoCdnUrl(url)) {
    const base = (url.split("?")[0].split("/").pop() || "").replace(/\.[^.]+$/, "");
    // 01-abc123def456 or 01-abc123def456-th → same shot
    const hash = base.replace(/^\d+-/, "").replace(/-th$/, "");
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
  // Our R2 CDN or Windows archive — no auction VPN / proxy hop.
  if (isOurPhotoCdnUrl(url)) score += 55_000;
  else if (url.startsWith("/api/lot-photos/")) score += 50_000;
  else if (url.startsWith("/api/lot-image")) score += 15_000;
  else if (isCopartCdnUrl(url)) score += 30_000;
  else if (/images\.bid\.cars|cdn\.bid\.cars|mercury\.bid\.cars/i.test(url)) score += 28_000;
  else if (/vis\.iaai\.com|anvisimages\.com/i.test(url)) score += 27_000;
  else if (/encar\.com/i.test(url)) score += 26_000;
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
