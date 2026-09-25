"use client";

import { useEffect, useState } from "react";
import { PurchasedCarCard } from "@/components/purchased/purchased-car-card";
import { fetchPurchased, type ApiPurchasedCar } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import {
  formatMoney,
  getPurchasedCarsFeed,
  purchasedCarsSummary,
  type PurchasedCar,
} from "@/lib/purchased-cars";

function mapApiCar(item: ApiPurchasedCar): PurchasedCar {
  return {
    id: item.id,
    year: item.year,
    make: item.make,
    model: item.model,
    image: item.image,
    source: item.source,
    region: item.region === "Англия" ? "Англия" : "США",
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

export function PurchasedKitsFeed() {
  const [cars, setCars] = useState<PurchasedCar[]>(() => getPurchasedCarsFeed());

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    fetchPurchased(12)
      .then((items) => {
        if (cancelled || !items.length) return;
        setCars(items.map(mapApiCar));
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
