/**
 * Калькулятор «авто под восстановление» — порт quote_iaai(purpose=restoration)
 * из mg group bot/iaai.py
 */
import { round2 } from "./shared";
import { lookupUsaDelivery, normalizeSize, type VehicleSize } from "./usa-delivery";
import { lookupTitleFee, type TitleFeeInfo } from "./usa-title";

export const USA_TRANSFER_FEE_RATE = 0.035;
export const USA_DISPATCHING_USD = 250;
export const SUBLOT_FEE_USD = 100;

export const RESTORATION_OCEAN_USD: Record<VehicleSize, number> = {
  regular: 1095,
  oversize: 1595,
  moto: 650,
};

export const RESTORATION_SIZE_LABELS: Record<VehicleSize, string> = {
  regular: "Regular / Large",
  oversize: "Oversize",
  moto: "Moto",
};

export type RestorationQuoteInput = {
  bid: number;
  /** Аукционные сборы (IAAI-таблица или ручной ввод) */
  auctionFeesUsd?: number | null;
  location?: string | null;
  auctionPlatform?: "iaai" | "copart" | string | null;
  vehicleSize?: VehicleSize | string | null;
  oceanDestination?: "klaipeda" | "poti" | string | null;
  /** Ручной inland / ocean (если площадка не найдена в прайсе) */
  inlandUsd?: number | null;
  oceanUsd?: number | null;
  titleCode?: string | null;
  isSublot?: boolean;
  includeDelivery?: boolean;
};

export type RestorationQuote = {
  purpose: "restoration";
  bid: number;
  auctionFeesUsd: number;
  auctionTotal: number;
  vehicleSize: VehicleSize;
  vehicleSizeLabel: string;
  delivery: {
    location: string | null;
    matchedLocation: string | null;
    matchedAuction: string | null;
    usPort: string | null;
    usPortLabel: string | null;
    inlandUsd: number;
    oceanUsd: number;
    oceanDestination: string;
    fromTariff: boolean;
  } | null;
  titleDocument: string | null;
  titleFeeInfo: TitleFeeInfo | null;
  titleDocUsd: number;
  isSublot: boolean;
  sublotUsd: number;
  subtotalUsa: number;
  dispatchingUsd: number;
  transferFee: number;
  transferFeeRate: number;
  usaWithFees: number;
  /** Итого США (без таможни РБ) */
  grandUsd: number;
};

export function estimateBidcarsAuctionFees(bid: number, auctionFeesUsd: number) {
  const sale = round2(bid);
  const fees = round2(Number(auctionFeesUsd) || 0);
  return {
    bid: sale,
    auctionFeesUsd: fees,
    feesNet: fees,
    iaaiTotal: round2(sale + fees),
  };
}

export function quoteRestoration(input: RestorationQuoteInput): RestorationQuote | null {
  if (input.bid == null || Number.isNaN(input.bid) || input.bid < 0) return null;

  const size = normalizeSize(input.vehicleSize);
  const fees = estimateBidcarsAuctionFees(input.bid, input.auctionFeesUsd ?? 0);
  const titleText = String(input.titleCode || "").trim() || null;
  const titleFeeInfo = titleText ? lookupTitleFee(titleText) : null;
  const titleDocUsd =
    titleFeeInfo && titleFeeInfo.costUsd != null && !titleFeeInfo.unmatched
      ? round2(titleFeeInfo.costUsd)
      : 0;
  const sublotOn = Boolean(input.isSublot);
  const sublotUsd = sublotOn ? SUBLOT_FEE_USD : 0;

  let americaSubtotal = fees.iaaiTotal;
  let delivery: RestorationQuote["delivery"] = null;

  if (input.includeDelivery !== false) {
    const dest = String(input.oceanDestination || "klaipeda").toLowerCase() === "poti" ? "poti" : "klaipeda";
    const tariff = lookupUsaDelivery(
      input.location,
      size,
      input.auctionPlatform || "iaai",
      dest,
    );

    let inland: number;
    let ocean: number;
    let fromTariff = false;

    if (tariff) {
      inland = round2(tariff.inlandUsd);
      ocean =
        input.oceanUsd != null && input.oceanUsd >= 0
          ? round2(input.oceanUsd)
          : round2(tariff.oceanUsd);
      fromTariff = true;
    } else {
      inland =
        input.inlandUsd != null && input.inlandUsd >= 0
          ? round2(input.inlandUsd)
          : 450;
      ocean =
        input.oceanUsd != null && input.oceanUsd >= 0
          ? round2(input.oceanUsd)
          : round2(RESTORATION_OCEAN_USD[size]);
    }

    americaSubtotal = round2(fees.iaaiTotal + inland + ocean + titleDocUsd + sublotUsd);
    delivery = {
      location: input.location ?? null,
      matchedLocation: tariff?.matchedLocation ?? null,
      matchedAuction: tariff?.matchedAuction ?? null,
      usPort: tariff?.usPort ?? null,
      usPortLabel: tariff?.usPortLabel ?? null,
      inlandUsd: inland,
      oceanUsd: ocean,
      oceanDestination: dest,
      fromTariff,
    };
  } else {
    americaSubtotal = round2(fees.iaaiTotal + titleDocUsd + sublotUsd);
  }

  const dispatchingUsd = USA_DISPATCHING_USD;
  const transferFee = round2(americaSubtotal * USA_TRANSFER_FEE_RATE);
  const usaWithFees = round2(americaSubtotal + dispatchingUsd + transferFee);

  return {
    purpose: "restoration",
    bid: fees.bid,
    auctionFeesUsd: fees.auctionFeesUsd,
    auctionTotal: fees.iaaiTotal,
    vehicleSize: size,
    vehicleSizeLabel: RESTORATION_SIZE_LABELS[size],
    delivery,
    titleDocument: titleText,
    titleFeeInfo,
    titleDocUsd,
    isSublot: sublotOn,
    sublotUsd,
    subtotalUsa: americaSubtotal,
    dispatchingUsd,
    transferFee,
    transferFeeRate: USA_TRANSFER_FEE_RATE,
    usaWithFees,
    grandUsd: usaWithFees,
  };
}
