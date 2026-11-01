"use client";

import { useEffect, useState } from "react";
import { PurchasedCarCard } from "@/components/purchased/purchased-car-card";
import { fetchLotsPage, fetchPurchased, type ApiPurchasedCar } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import { formatOdometerKm } from "@/lib/auctions/odometer";
import { estimateLotBreakdown } from "@/lib/auctions/lot-quote";
import { hashSeed } from "@/lib/auctions/example-picks";
import { SOURCE_LABELS, type AuctionLot } from "@/lib/auctions/types";
import { marketPriceFromTurnkey } from "@/lib/pricing/market-savings";
import {
  formatMoney,
  getPurchasedCarsFeed,
  purchasedCarsSummary,
  type PurchasedCar,
} from "@/lib/purchased-cars";

function regionLabel(raw: string): PurchasedCar["region"] {
  const value = raw.trim().toLowerCase();
  if (value === "uk" || value === "англия") return "Англия";
  if (value === "china" || value === "китай") return "Китай";
  if (value === "korea" || value === "корея") return "Корея";
  return "США";
}

function displayModel(make: string, model: string) {
  let name = model.trim();
  const prefix = `${make.trim()} `;
  if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
    name = name.slice(prefix.length).trim();
  }
  return name.replace(/\s*\(import\)\s*/gi, " ").replace(/\bRs\b/g, "RS").replace(/\s+/g, " ").trim();
}

function mapApiCar(item: ApiPurchasedCar): PurchasedCar {
  return {
    id: item.id,
    year: item.year,
    make: item.make,
    model: displayModel(item.make, item.model),
    image: item.image,
    source: item.source,
    region: regionLabel(item.region),
    purchasedAt: "",
    damage: item.damage,
    odometer: item.odometer,
    auctionPrice: item.auctionPrice,
    delivery: item.delivery,
    dismantle: item.dismantle,
    deliveryAndFees: item.deliveryAndFees,
    totalCost: item.totalCost,
    marketBy: item.marketBy,
    currency: item.currency,
    href: item.href,
  };
}

function audiFromLot(lot: AuctionLot): PurchasedCar | null {
  const quote = estimateLotBreakdown(lot);
  if (!quote || quote.amount <= 0 || !lot.imageUrl) return null;
  return {
    id: `auction-${lot.id}`,
    year: lot.year,
    make: "Audi",
    model: displayModel(lot.make, lot.model),
    image: lot.imageUrl.replace(/-th\.jpg(?=$|\?)/, ".jpg"),
    source: SOURCE_LABELS[lot.source] ?? lot.source,
    region: regionLabel(lot.region),
    purchasedAt: "",
    damage: lot.primaryDamage || "",
    odometer: formatOdometerKm(lot.odometer, lot.odometerUnit),
    auctionPrice: quote.auctionTotal,
    delivery: quote.delivery,
    dismantle: quote.dismantle,
    deliveryAndFees: quote.deliveryAndFees,
    totalCost: quote.amount,
    marketBy: marketPriceFromTurnkey(quote.amount, hashSeed(lot.id)),
    currency: quote.currency,
    href: `/auctions/${lot.slug}/`,
  };
}

function audiScore(lot: AuctionLot) {
  const model = lot.model.toLowerCase();
  if (/\ba6\b/.test(model)) return 5;
  if (/\bq5\b/.test(model)) return 4;
  if (/\ba4\b/.test(model)) return 4;
  if (/\ba8\b/.test(model)) return 3;
  if (/\b(a[3-8]|q[2-8]|s[3-8])\b/.test(model)) return 2;
  return 0;
}

function imageLoads(url: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(false), 8000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img.naturalWidth > 0);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

async function pickAudi(lots: AuctionLot[]): Promise<PurchasedCar | null> {
  const audis = lots
    .filter((lot) => /audi/i.test(lot.make) && lot.imageUrl && lot.currentBid > 0)
    .sort((a, b) => audiScore(b) - audiScore(a));
  for (const lot of audis) {
    const card = audiFromLot(lot);
    if (!card) continue;
    if (await imageLoads(card.image)) return card;
  }
  return null;
}

export function PurchasedKitsFeed() {
  const [cars, setCars] = useState<PurchasedCar[]>(() => getPurchasedCarsFeed());

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    Promise.all([
      fetchPurchased(12).catch(() => [] as ApiPurchasedCar[]),
      fetchLotsPage({ q: "Audi A6", pageSize: 12 }).catch(() => null),
    ])
      .then(async ([items, audiPage]) => {
        if (cancelled) return;
        const kits = items
          .filter((item) => item.source !== "encar" && item.source !== "china_market")
          .map(mapApiCar);
        let audi = await pickAudi(audiPage?.items ?? []);
        if (!audi && !cancelled) {
          const wider = await fetchLotsPage({ q: "Audi", pageSize: 24 }).catch(() => null);
          if (!cancelled) audi = await pickAudi(wider?.items ?? []);
        }
        if (cancelled) return;
        const rest = audi
          ? kits.filter((car) => car.id !== audi.id && !/audi/i.test(car.make))
          : kits;
        const next = audi ? [audi, ...rest] : rest;
        if (next.length) setCars(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = purchasedCarsSummary(cars);

  return (
    <>
      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <div className="card-premium rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">Примеров</p>
          <p className="mt-2 font-display text-3xl font-semibold text-accent-dark">{summary.count}</p>
        </div>
        <div className="card-premium rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
            Средняя выгода
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-accent-dark">
            {summary.avgSavings}%
          </p>
        </div>
        <div className="card-premium rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
            Сэкономили клиентам
          </p>
          <p className="mt-2 font-display text-3xl font-semibold text-accent-dark">
            {formatMoney(summary.savedUsd, "USD")}
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {cars.map((car) => (
          <PurchasedCarCard key={car.id} car={car} />
        ))}
      </div>
    </>
  );
}
