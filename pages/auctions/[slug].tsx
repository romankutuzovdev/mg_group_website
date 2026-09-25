"use client";

import { GetStaticPaths, GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { LotDamageMap } from "@/components/auctions/lot-damage-map";
import { LotImage } from "@/components/auctions/lot-image";
import { ManagerLotSource } from "@/components/auctions/manager-lot-source";
import { LotCalculatorPanel } from "@/components/pricing/lot-calculator-panel";
import { AnchorButton, LinkButton } from "@/components/site/button";
import { absoluteUrl } from "@/lib/catalog";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { loadLotBySlug } from "@/lib/auctions/repository";
import { buildSeoInventory } from "@/lib/auctions/seo-inventory";
import type { AuctionLot } from "@/lib/auctions/types";
import {
  CLOSED_AUCTION_HINT,
  CLOSED_AUCTION_LABEL,
  isClosedAuction,
  REGION_LABELS,
} from "@/lib/auctions/types";
import { formatOdometerKm } from "@/lib/auctions/odometer";
import {
  formatDriveRu,
  formatFuelRu,
  formatTransmissionRu,
} from "@/lib/auctions/lot-specs";
import { CONSULTATION_TG, consultationMessage } from "@/lib/company";

function formatMoney(amount: number, currency: "USD" | "GBP" | "KRW") {
  const locale = currency === "GBP" ? "en-GB" : currency === "KRW" ? "ko-KR" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function SpecRow({ label, value }: { label: string; value: string | boolean }) {
  const display = typeof value === "boolean" ? (value ? "Да" : "Нет") : value;
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className="text-right font-medium">{display}</span>
    </div>
  );
}

function lotVehicleJsonLd(lot: AuctionLot, path: string) {
  const url = absoluteUrl(path);
  const image =
    lot.imageUrl && /^https?:\/\//i.test(lot.imageUrl)
      ? lot.imageUrl
      : absoluteUrl(lot.imageUrl || "/logo.png");

  return {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: `${lot.year} ${lot.make} ${lot.model}`,
    brand: { "@type": "Brand", name: lot.make },
    model: lot.model,
    vehicleModelDate: String(lot.year),
    color: lot.exteriorColor || undefined,
    vehicleIdentificationNumber: lot.vin || undefined,
    mileageFromOdometer: {
      "@type": "QuantitativeValue",
      value: lot.odometer,
      unitCode: lot.odometerUnit === "km" ? "KMT" : "SMI",
    },
    image,
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: lot.currency,
      price: lot.currentBid,
      availability: "https://schema.org/InStock",
      ...(lot.auctionDate
        ? { priceValidUntil: lot.auctionDate.slice(0, 10) }
        : {}),
    },
  };
}

interface Props {
  dictionary: Dictionary;
  lot: AuctionLot;
}

export default function LotDetailPage({ dictionary, lot }: Props) {
  const lotPath = `/auctions/${lot.slug}/`;
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: `${lot.year} ${lot.make} ${lot.model} | MG.GROUP`,
            description: `Лот #${lot.lotNumber}. ${lot.primaryDamage}. Ставка от ${formatMoney(lot.currentBid, lot.currency)}.`,
          },
        }}
        lang="ru"
        path={lotPath}
        image={lot.imageUrl || undefined}
        jsonLd={lotVehicleJsonLd(lot, lotPath)}
      />
      <div className="pt-16">
        <div className="border-b border-border bg-bg-elevated">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Link
              href={
                lot.region === "usa"
                  ? "/avto/usa/#lots"
                  : lot.region === "korea"
                    ? "/avto/korea/#lots"
                    : lot.region === "china"
                      ? "/avto/china/#lots"
                      : "/mashinokomplekt/uk/#lots"
              }
              className="inline-flex items-center gap-1 text-sm text-text-secondary transition hover:text-accent-dark"
            >
              {lot.region === "usa"
                ? "← К каталогу авто из США"
                : lot.region === "korea"
                  ? "← К каталогу авто из Кореи"
                  : lot.region === "china"
                    ? "← К каталогу авто из Китая"
                    : "← К комплектам из Англии"}
            </Link>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-dark">
                    {REGION_LABELS[lot.region]}
                  </span>
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-text-secondary">
                    #{lot.lotNumber}
                  </span>
                  {isClosedAuction(lot) ? (
                    <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">
                      {CLOSED_AUCTION_LABEL}
                    </span>
                  ) : null}
                  <ManagerLotSource lot={lot} showLink={false} className="inline-flex" />
                </div>
                <h1 className="mt-3 font-display text-2xl font-bold md:text-3xl">
                  {lot.year} {lot.make} {lot.model}
                </h1>
                <p className="mt-1 font-mono text-sm text-text-muted">{lot.vin}</p>
                {isClosedAuction(lot) ? (
                  <p className="mt-2 max-w-xl text-sm text-text-secondary">{CLOSED_AUCTION_HINT}</p>
                ) : null}
                <ManagerLotSource lot={lot} showBadge={false} className="block" />
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
            <div className="w-full min-w-0 lg:col-start-1 lg:row-start-1">
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-zinc-100">
                <LotImage
                  src={lot.imageUrl}
                  alt={`${lot.year} ${lot.make} ${lot.model}`}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 1024px) 100vw, 66vw"
                />
              </div>
            </div>

            <aside className="space-y-4 lg:col-start-2 lg:row-span-2 lg:self-start lg:sticky lg:top-24">
              <div className="card-premium rounded-xl p-5 sm:p-6">
                <p className="text-sm text-text-muted">Ставка на аукционе</p>
                <p className="font-display text-3xl font-bold text-accent-dark">
                  {formatMoney(lot.currentBid, lot.currency)}
                </p>
                {lot.buyNowPrice ? (
                  <p className="mt-2 text-sm text-text-secondary">
                    Buy Now:{" "}
                    <span className="font-semibold text-text-primary">
                      {formatMoney(lot.buyNowPrice, lot.currency)}
                    </span>
                  </p>
                ) : null}

                <div className="mt-4 rounded-lg bg-accent/10 p-3 text-sm">
                  <p className="font-medium text-accent-dark">Дата торгов</p>
                  <p className="mt-0.5 text-text-secondary">{formatDate(lot.auctionDate)}</p>
                </div>

                {isClosedAuction(lot) ? (
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                    <p className="font-semibold text-zinc-900">{CLOSED_AUCTION_LABEL}</p>
                    <p className="mt-1 text-text-secondary">{CLOSED_AUCTION_HINT}</p>
                  </div>
                ) : null}

                <LinkButton href="/contacts/" className="mt-5 w-full">
                  Оставить заявку
                </LinkButton>
                <AnchorButton
                  href={consultationMessage(
                    `Здравствуйте! Нужен Carfax / история авто по лоту #${lot.lotNumber}: ${lot.year} ${lot.make} ${lot.model}, VIN ${lot.vin}.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="secondary"
                  className="mt-2.5 w-full"
                >
                  Запросить историю авто
                </AnchorButton>
              </div>

              <LotCalculatorPanel lot={lot} />
            </aside>

            <div className="space-y-6 lg:col-start-1">
              <div className="card-premium rounded-xl p-5 sm:p-6">
                <h2 className="font-display text-lg font-semibold">Характеристики</h2>
                <div className="mt-4">
                  <SpecRow label="Повреждение (основное)" value={lot.primaryDamage} />
                  {lot.secondaryDamage ? (
                    <SpecRow label="Повреждение (доп.)" value={lot.secondaryDamage} />
                  ) : null}
                  <SpecRow label="Title" value={lot.titleLabel} />
                  <SpecRow
                    label="Пробег"
                    value={formatOdometerKm(lot.odometer, lot.odometerUnit)}
                  />
                  {lot.engine ? <SpecRow label="Двигатель" value={lot.engine} /> : null}
                  {lot.bodyStyle ? <SpecRow label="Кузов" value={lot.bodyStyle} /> : null}
                  <SpecRow label="КПП" value={formatTransmissionRu(lot.transmission)} />
                  <SpecRow label="Топливо" value={formatFuelRu(lot.fuel)} />
                  <SpecRow label="Привод" value={formatDriveRu(lot.drive)} />
                  <SpecRow label="Цвет" value={lot.exteriorColor} />
                  <SpecRow label="Ключи" value={lot.hasKeys} />
                  <SpecRow label="Run & Drive" value={lot.runsDrives} />
                  <SpecRow label="Локация" value={lot.location} />
                </div>
              </div>

              <LotDamageMap
                primaryDamage={lot.primaryDamage}
                secondaryDamage={lot.secondaryDamage}
              />

              <div className="card-premium rounded-xl p-5 sm:p-6">
                <h2 className="font-display text-lg font-semibold">Оценка запчастей</h2>
                <p className="mt-2 text-sm text-text-secondary">
                  Подберём комплектацию и ориентир по запчастям — напишите менеджеру с номером лота.
                </p>
                <a
                  href={CONSULTATION_TG}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex text-sm font-medium text-accent-dark underline underline-offset-2"
                >
                  Уточнить у менеджера →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { getAuctionSsgLimit } = await import("@/lib/auctions/seo-inventory");
  const limit = getAuctionSsgLimit();
  if (limit <= 0) {
    return { paths: [], fallback: false };
  }
  const { auctionSlugs } = await buildSeoInventory();
  return {
    paths: auctionSlugs.slice(0, limit).map((slug) => ({ params: { slug } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps = async (ctx) => {
  const slug = String(ctx.params?.slug ?? "");
  const lot = await loadLotBySlug(slug);
  if (!lot) {
    return { notFound: true };
  }
  return {
    props: {
      dictionary: getDictionary(),
      lot,
    },
  };
};
