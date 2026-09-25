/**
 * Backend base URL.
 *
 * - Browser on HTTPS (mg-group.by / pages.dev): same-origin `/api/v1/*`
 *   via Cloudflare Pages Function → Windows API.
 * - Browser on HTTP (local next): `NEXT_PUBLIC_API_URL` direct to Windows API.
 * - Node SSG / scripts: `API_URL` or `NEXT_PUBLIC_API_URL`.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    if (window.location.protocol === "https:") {
      // Pages Function at /api/v1/* (see functions/api/v1/[[path]].js)
      return "";
    }
    return (process.env.NEXT_PUBLIC_API_URL?.trim() || "").replace(/\/$/, "");
  }
  return (
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
}

export function isApiEnabled(): boolean {
  if (typeof window !== "undefined") {
    if (window.location.protocol === "https:") return true;
    return Boolean(process.env.NEXT_PUBLIC_API_URL?.trim());
  }
  return Boolean(
    process.env.API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim(),
  );
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
