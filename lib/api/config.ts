/**
 * Backend base URL. Empty → local JSON fallback (build/offline).
 * Example: http://127.0.0.1:8000 or https://api.example.com
 */
export function getApiBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

export function isApiEnabled(): boolean {
  return getApiBaseUrl().length > 0;
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
