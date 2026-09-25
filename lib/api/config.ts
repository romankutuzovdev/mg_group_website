/**
 * Backend base URL.
 *
 * Site + API are served together from the Windows server (uvicorn).
 * In the browser always use same-origin `/api/v1/*` — works for both
 * http://91.149.133.54 and https://mg-group.by (CF Flexible → origin HTTP).
 * Node SSG / scripts still use NEXT_PUBLIC_API_URL / API_URL.
 */
const DEFAULT_API = "http://91.149.133.54";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return (
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    DEFAULT_API
  ).replace(/\/$/, "");
}

export function isApiEnabled(): boolean {
  if (typeof window !== "undefined") return true;
  return Boolean(
    process.env.API_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      DEFAULT_API,
  );
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
