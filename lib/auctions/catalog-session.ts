/** Persist catalog scroll/filters so "back" from a lot restores the same place. */

export const CATALOG_SESSION_KEY = "mg-catalog-restore-v1";

export type CatalogRestoreState = {
  path: string;
  scrollY: number;
  page: number;
  filters: Record<string, string | boolean>;
  focusSlug?: string;
  savedAt: number;
};

export function saveCatalogRestore(state: Omit<CatalogRestoreState, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const payload: CatalogRestoreState = { ...state, savedAt: Date.now() };
    sessionStorage.setItem(CATALOG_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function peekCatalogRestore(): CatalogRestoreState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CATALOG_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CatalogRestoreState;
    if (!data?.path || typeof data.scrollY !== "number") return null;
    // Ignore stale snapshots (> 30 min)
    if (Date.now() - (data.savedAt || 0) > 30 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export function consumeCatalogRestore(expectedPath?: string): CatalogRestoreState | null {
  const data = peekCatalogRestore();
  if (!data) return null;
  if (expectedPath) {
    const normalize = (p: string) => p.replace(/\/+$/, "") || "/";
    if (normalize(data.path) !== normalize(expectedPath)) return null;
  }
  try {
    sessionStorage.removeItem(CATALOG_SESSION_KEY);
  } catch {
    /* ignore */
  }
  return data;
}
