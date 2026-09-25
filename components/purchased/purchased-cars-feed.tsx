"use client";

import { useEffect, useState } from "react";
import { PurchasedCarCard } from "@/components/purchased/purchased-car-card";
import { fetchPurchasedCars, type ApiPurchasedWholeCar } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import {
  formatMoney,
  purchasedCarsSummary,
  type PurchasedCar,
} from "@/lib/purchased-cars";
import { LinkButton } from "@/components/site/button";

function mapApiCar(item: ApiPurchasedWholeCar): PurchasedCar {
  return {
    id: item.id,
    year: item.year,
    make: item.make,
    model: item.model,
    trim: item.trim,
    image: item.image,
    source: item.source,
    region: item.region === "Англия" ? "Англия" : "США",
    purchasedAt: item.purchasedAt || "",
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

export function PurchasedCarsFeed() {
  const [cars, setCars] = useState<PurchasedCar[]>([]);
  const [loaded, setLoaded] = useState(!isApiEnabled());

  useEffect(() => {
    if (!isApiEnabled()) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    fetchPurchasedCars(24)
      .then((items) => {
        if (cancelled) return;
        setCars(items.map(mapApiCar));
      })
      .catch(() => {
        if (!cancelled) setCars([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return <p className="text-sm text-text-secondary">Загрузка примеров…</p>;
  }

  if (cars.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Купленные авто под заказ
        </p>
        <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Пока нет опубликованных примеров
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
          Здесь появятся выкупленные целые авто из США. Менеджер добавляет их в кабинете — после
          публикации карточки отобразятся на этой странице.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/avto/">Каталог авто</LinkButton>
          <LinkButton href="/avto/usa/" variant="secondary">
            Лоты на аукционах
          </LinkButton>
        </div>
      </div>
    );
  }

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
