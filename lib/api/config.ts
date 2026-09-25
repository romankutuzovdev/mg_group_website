/**
 * Backend base URL.
 *
 * Site + API live on the Windows server (e.g. http://91.149.133.54).
 * Browser always calls that API origin (baked at build via NEXT_PUBLIC_API_URL).
 */
const DEFAULT_API = "http://91.149.133.54";

export function getApiBaseUrl(): string {
  const fromEnv = (
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    ""
  ).replace(/\/$/, "");

  if (typeof window !== "undefined") {
    // Same host as the API (IP or hostname) → relative /api/v1 (no CORS).
    const host = window.location.hostname;
    if (host === "91.149.133.54" || host === "127.0.0.1" || host === "localhost") {
      return "";
    }
    return fromEnv || DEFAULT_API;
  }

  return fromEnv || DEFAULT_API;
}

export function isApiEnabled(): boolean {
  return getApiBaseUrl().length > 0 || (
    typeof window !== "undefined" &&
    ["91.149.133.54", "127.0.0.1", "localhost"].includes(window.location.hostname)
  );
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
