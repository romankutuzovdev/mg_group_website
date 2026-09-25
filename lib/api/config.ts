/**
 * Backend base URL.
 *
 * Browser: always same-origin "" so https://mg-group.by calls /api/v1/*
 * (Pages Function or uvicorn StaticFiles) — never http:// IP (Mixed Content).
 * Node SSG: API_URL only (do not set NEXT_PUBLIC_API_URL to http://).
 */
const DEFAULT_API = "http://127.0.0.1";

export function getApiBaseUrl(): string {
  // Browser / hydrated client: same-origin only
  if (typeof window !== "undefined") {
    return "";
  }
  const fromEnv = (
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    DEFAULT_API
  ).replace(/\/$/, "");
  // Guard: never hand an http:// absolute URL to code that might run in HTTPS pages
  if (/^http:\/\//i.test(fromEnv) && process.env.NODE_ENV === "production") {
    // SSG on CI is fine with http:// to the Windows box
    return fromEnv;
  }
  return fromEnv;
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
