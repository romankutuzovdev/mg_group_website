import {
  addFavorite,
  fetchFavoriteIds,
  getCabinetToken,
  removeFavorite,
} from "@/lib/api/cabinet";

type Listener = () => void;

let ids = new Set<string>();
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeFavorites(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFavoriteIdsSnapshot(): Set<string> {
  return ids;
}

export function isFavoriteCached(lotId: string): boolean {
  return ids.has(lotId);
}

export async function ensureFavoritesLoaded(): Promise<void> {
  if (!getCabinetToken()) {
    ids = new Set();
    loaded = true;
    emit();
    return;
  }
  if (loaded) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const list = await fetchFavoriteIds();
      ids = new Set(list);
      loaded = true;
      emit();
    } catch {
      ids = new Set();
      loaded = true;
      emit();
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function resetFavoritesCache(): void {
  ids = new Set();
  loaded = false;
  loading = null;
  emit();
}

/** Sync cache from a full favorites list without notifying listeners. */
export function hydrateFavorites(lotIds: string[]): void {
  ids = new Set(lotIds);
  loaded = true;
  loading = null;
}

export async function toggleFavorite(lotId: string): Promise<boolean> {
  if (!getCabinetToken()) {
    throw new Error("auth_required");
  }
  await ensureFavoritesLoaded();
  const next = new Set(ids);
  if (next.has(lotId)) {
    await removeFavorite(lotId);
    next.delete(lotId);
    ids = next;
    emit();
    return false;
  }
  await addFavorite(lotId);
  next.add(lotId);
  ids = next;
  emit();
  return true;
}
