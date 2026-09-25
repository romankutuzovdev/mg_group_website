"use client";

import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import { useRouter } from "next/router";
import { getCabinetToken } from "@/lib/api/cabinet";
import {
  ensureFavoritesLoaded,
  getFavoriteIdsSnapshot,
  subscribeFavorites,
  toggleFavorite,
} from "@/lib/favorites-cache";

type Props = {
  lotId: string;
  className?: string;
};

export function FavoriteButton({ lotId, className = "" }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const favIds = useSyncExternalStore(
    subscribeFavorites,
    getFavoriteIdsSnapshot,
    () => new Set<string>(),
  );
  const active = mounted && favIds.has(lotId);

  useEffect(() => {
    setMounted(true);
    if (getCabinetToken()) {
      void ensureFavoritesLoaded();
    }
  }, []);

  const onClick = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!getCabinetToken()) {
      void router.push("/cabinet/");
      return;
    }
    setBusy(true);
    try {
      await toggleFavorite(lotId);
    } catch {
      void router.push("/cabinet/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => void onClick(e)}
      disabled={busy}
      aria-label={active ? "Убрать из избранного" : "В избранное"}
      aria-pressed={active}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-sm backdrop-blur-sm transition hover:bg-black/75 disabled:opacity-60 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-4 w-4 ${active ? "text-rose-400" : "text-white"}`}
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21s-6.7-4.35-9.33-8.1C.8 10.4 1.2 6.9 4.05 5.2c1.9-1.13 4.3-.7 5.7 1.05C11.1 4.5 13.5 4.07 15.4 5.2c2.85 1.7 3.25 5.2 1.38 7.7C18.7 16.65 12 21 12 21z"
        />
      </svg>
    </button>
  );
}
