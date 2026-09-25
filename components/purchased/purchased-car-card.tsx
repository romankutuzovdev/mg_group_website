import Image from "next/image";
import Link from "next/link";
import {
  formatMoney,
  savingsPercent,
  type PurchasedCar,
} from "@/lib/purchased-cars";

export function PurchasedCarCard({ car }: { car: PurchasedCar }) {
  const savings = savingsPercent(car);
  const title = `${car.year} ${car.make} ${car.model}${car.trim ? ` ${car.trim}` : ""}`;

  const body = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-100">
        {car.image ? (
          <Image
            src={car.image}
            alt={title}
            fill
            unoptimized
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">
            Нет фото
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {car.source}
          </span>
          <span className="rounded-md bg-accent/90 px-2 py-0.5 text-[10px] font-semibold text-white">
            {car.region}
          </span>
        </div>
        {savings > 0 ? (
          <span className="absolute right-3 top-3 rounded-md bg-accent-dark px-2 py-0.5 text-[10px] font-semibold text-white">
            −{savings}% к рынку РБ
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug group-hover:text-accent-dark">{title}</h3>
          <span className="shrink-0 text-xs text-text-muted">{car.purchasedAt}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {car.damage ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">{car.damage}</span>
          ) : null}
          {car.odometer ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-text-secondary">
              {car.odometer}
            </span>
          ) : null}
        </div>

        <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Аукцион</dt>
            <dd className="font-medium">{formatMoney(car.auctionPrice, car.currency)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Доставка</dt>
            <dd className="font-medium">{formatMoney(car.delivery, car.currency)}</dd>
          </div>
          {car.dismantle > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Разбор</dt>
              <dd className="font-medium">{formatMoney(car.dismantle, car.currency)}</dd>
            </div>
          ) : null}
          {car.deliveryAndFees > car.delivery + car.dismantle ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Сборы / диспетчинг</dt>
              <dd className="font-medium">
                {formatMoney(car.deliveryAndFees - car.delivery - car.dismantle, car.currency)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-border pt-2">
            <dt className="font-semibold">Под ключ</dt>
            <dd className="font-display text-xl font-semibold text-accent-dark">
              {formatMoney(car.totalCost, car.currency)}
            </dd>
          </div>
          {car.marketBy > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Рынок РБ</dt>
              <dd className="text-text-secondary line-through">
                {formatMoney(car.marketBy, car.currency)}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </>
  );

  if (car.href) {
    return (
      <Link href={car.href} className="card-premium group block overflow-hidden rounded-xl">
        {body}
      </Link>
    );
  }

  return <article className="card-premium overflow-hidden rounded-xl">{body}</article>;
}
