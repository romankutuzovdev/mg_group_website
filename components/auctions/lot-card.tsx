import Link from "next/link";
import { LotImage } from "@/components/auctions/lot-image";
import { FavoriteButton } from "@/components/auctions/favorite-button";
import {
  defaultPricingMode,
  estimateLotTurnkey,
  type LotPricingMode,
} from "@/lib/auctions/lot-quote";
import type { AuctionLot } from "@/lib/auctions/types";
import { CLOSED_AUCTION_LABEL, isClosedAuction, REGION_LABELS } from "@/lib/auctions/types";
import { formatOdometerKm } from "@/lib/auctions/odometer";

function formatMoney(amount: number, currency: "USD" | "GBP" | "KRW") {
  const locale = currency === "GBP" ? "en-GB" : currency === "KRW" ? "ko-KR" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatAuctionWhen(iso: string): { absolute: string; relative: string | null } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { absolute: "—", relative: null };
  }
  const absolute = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return { absolute, relative: "сейчас" };

  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    const remH = hours % 24;
    return {
      absolute,
      relative: remH > 0 ? `через ${days} дн. ${remH} ч` : `через ${days} дн.`,
    };
  }
  if (hours >= 1) {
    const mins = Math.floor((diffMs % 3_600_000) / 60_000);
    return {
      absolute,
      relative: mins > 0 ? `через ${hours} ч ${mins} мин` : `через ${hours} ч`,
    };
  }
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  return { absolute, relative: `через ${mins} мин` };
}

function shortDamage(value: string): string {
  const t = (value || "").trim();
  if (!t || t === "Unknown") return "";
  return t.length > 22 ? `${t.slice(0, 20)}…` : t;
}

export function LotCard({
  lot,
  pricingMode,
  onNavigate,
}: {
  lot: AuctionLot;
  pricingMode?: LotPricingMode;
  onNavigate?: (slug: string) => void;
}) {
  const mode = pricingMode ?? defaultPricingMode(lot);
  let turnkey: ReturnType<typeof estimateLotTurnkey> = null;
  try {
    turnkey = estimateLotTurnkey(lot, mode);
  } catch {
    turnkey = null;
  }

  const when = formatAuctionWhen(lot.auctionDate);
  const damage = shortDamage(lot.primaryDamage);
  const specs = [
    formatOdometerKm(lot.odometer, lot.odometerUnit),
    damage || null,
    lot.hasKeys ? "Есть ключ" : null,
  ].filter(Boolean) as string[];

  return (
    <Link
      href={`/auctions/${lot.slug}/`}
      className="group block h-full min-w-0"
      data-lot-slug={lot.slug}
      onClick={() => onNavigate?.(lot.slug)}
    >
      <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-zinc-100">
          <LotImage
            src={lot.imageUrl}
            alt={`${lot.year} ${lot.make} ${lot.model}`}
            fill
            loading="lazy"
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
            sizes="(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-800 shadow-sm backdrop-blur-sm">
              {REGION_LABELS[lot.region]}
            </span>
            {isClosedAuction(lot) ? (
              <span className="rounded-md bg-zinc-900/90 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-sm backdrop-blur-sm">
                {CLOSED_AUCTION_LABEL}
              </span>
            ) : null}
            {lot.buyNowPrice ? (
              <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                Buy Now
              </span>
            ) : null}
            {lot.runsDrives ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#22c55e] px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-sm ring-2 ring-white/40">
                <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
                На ходу
              </span>
            ) : null}
          </div>

          <div className="absolute right-3 top-3 z-10">
            <FavoriteButton lotId={lot.id} />
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5 sm:gap-3 sm:p-3">
            <div className="min-w-0 rounded-xl bg-[#0D3F10]/92 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/10 backdrop-blur-md sm:px-3.5 sm:py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200/90">
                Текущая ставка
              </p>
              <p className="font-display text-xl font-bold tabular-nums tracking-tight text-white sm:text-2xl">
                {formatMoney(lot.currentBid, lot.currency)}
              </p>
            </div>
            {when.relative ? (
              <span className="shrink-0 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm sm:text-[11px]">
                {when.relative}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col px-3.5 pb-3.5 pt-3.5 sm:px-4 sm:pb-4 sm:pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">
              {lot.year}
            </p>
            <h3 className="mt-0.5 line-clamp-2 font-display text-[15px] font-semibold leading-snug tracking-tight text-zinc-900 transition group-hover:text-accent-dark sm:text-base">
              {lot.make} {lot.model}
            </h3>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            <span className="font-medium text-zinc-600">{when.absolute}</span>
            {lot.location ? (
              <>
                <span className="mx-1.5 text-zinc-300">·</span>
                <span className="truncate">{lot.location}</span>
              </>
            ) : null}
          </p>

          {specs.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 border-t border-zinc-100 pt-3 text-[11px] text-zinc-600 sm:text-xs">
              {specs.map((item, i) => (
                <span key={`${item}-${i}`} className="inline-flex items-center gap-2">
                  {i > 0 ? <span className="text-zinc-300" aria-hidden>•</span> : null}
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto pt-3">
            {turnkey ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-[#22c55e]/15 to-[#22c55e]/5 px-3 py-2.5 ring-1 ring-inset ring-[#22c55e]/30">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0D3F10]">
                    {turnkey.label}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    {mode === "restoration"
                      ? "ставка + сборы + доставка"
                      : "ставка + аукцион + доставка + разбор"}
                  </p>
                </div>
                <p className="shrink-0 font-display text-lg font-bold tabular-nums tracking-tight text-[#0D3F10] sm:text-xl">
                  {formatMoney(turnkey.amount, turnkey.currency)}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2.5 text-xs text-zinc-500">
                <span>Подробнее о лоте</span>
                <span className="font-medium text-accent-dark transition group-hover:translate-x-0.5">
                  →
                </span>
              </div>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
