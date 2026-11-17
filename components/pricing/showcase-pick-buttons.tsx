"use client";

import { useEffect, useState } from "react";
import { Check, Home, Loader2, ShoppingBag } from "lucide-react";
import { staffSaveShowcasePick, type ShowcasePickInput } from "@/lib/api/cabinet";
import type { LotFromUrlResponse } from "@/lib/api/client";
import { formatOdometerKm } from "@/lib/auctions/odometer";
import { isJunkLotImageUrl } from "@/lib/auctions/lot-image-url";
import { SOURCE_LABELS, type AuctionSource } from "@/lib/auctions/types";
import { useIsManager } from "@/lib/use-is-manager";

/** Карточка лота для витрины: то, что видит клиент на главной. */
export type ShowcaseLotCard = Pick<
  ShowcasePickInput,
  "year" | "make" | "model" | "image_url" | "source" | "damage" | "odometer" | "region"
>;

export function showcaseLotCard(lot: LotFromUrlResponse, fallbackSource = ""): ShowcaseLotCard {
  const image = (lot.images || []).find((url) => url && !isJunkLotImageUrl(url)) || "";
  const odometer =
    lot.odometer != null && Number(lot.odometer) > 0
      ? formatOdometerKm(Number(lot.odometer), lot.odometerUnit === "km" ? "km" : "mi")
      : "";
  return {
    year: lot.year ?? null,
    make: lot.make || "",
    model: lot.model || "",
    image_url: image,
    source: SOURCE_LABELS[lot.source as AuctionSource] || fallbackSource,
    damage: lot.primaryDamage || "",
    odometer,
    region: lot.region === "uk" || lot.source === "copart_uk" ? "uk" : "usa",
  };
}

type Saved = "home" | "bought" | null;

/** Видны только менеджеру/админу: сохранить просчёт на главную или в «Купленные авто». */
export function ShowcasePickButtons({ pick }: { pick: ShowcasePickInput | null }) {
  const isManager = useIsManager();
  const [busy, setBusy] = useState<Saved>(null);
  const [saved, setSaved] = useState<Saved>(null);
  const [error, setError] = useState<string | null>(null);
  const lotKey = `${pick?.kind}|${pick?.lot_url || pick?.title || ""}`;

  useEffect(() => {
    setSaved(null);
    setError(null);
  }, [lotKey]);

  if (!isManager) return null;

  const ready = Boolean(pick && pick.total_usd && pick.total_usd > 0);

  const save = async (target: "home" | "bought") => {
    if (!pick || !ready) return;
    setBusy(target);
    setError(null);
    try {
      await staffSaveShowcasePick({
        ...pick,
        ...(target === "home" ? { on_home: true } : { bought: true }),
      });
      setSaved(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
        Для менеджера
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!ready || busy != null}
          onClick={() => void save("home")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-dark px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "home" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved === "home" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Home className="h-4 w-4" />
          )}
          {saved === "home" ? "На главной" : "На главную"}
        </button>
        <button
          type="button"
          disabled={!ready || busy != null}
          onClick={() => void save("bought")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-accent-dark px-3 py-2 text-sm font-medium text-accent-dark transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "bought" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved === "bought" ? (
            <Check className="h-4 w-4" />
          ) : (
            <ShoppingBag className="h-4 w-4" />
          )}
          {saved === "bought" ? "В купленных" : "Купили"}
        </button>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {!ready
          ? "Загрузите лот и дождитесь итога — тогда можно сохранить."
          : saved === "home"
            ? "Лот в блоке «Выбор менеджеров» на главной. Убрать — в кабинете, раздел «Витрина»."
            : saved === "bought"
              ? "Лот в блоке «Купленные авто» на главной с итоговой ценой."
              : "«На главную» — хороший вариант для клиентов. «Купили» — покажем в купленных с ценой."}
      </p>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
