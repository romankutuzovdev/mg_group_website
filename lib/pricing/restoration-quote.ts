/**
 * Калькулятор «авто под восстановление» — порт quote_iaai(purpose=restoration)
 * из mg group bot/iaai.py
 */
import { round2 } from "./shared";
import { lookupUsaDelivery, normalizeSize, type VehicleSize } from "./usa-delivery";
import { lookupTitleFee, type TitleFeeInfo } from "./usa-title";

export const USA_TRANSFER_FEE_RATE = 0.035;
/** Услуги компании в США: выкуп и диспетчирование */
export const USA_DISPATCHING_USD = 200;
/** Оформление документов */
export const USA_DOCS_FEE_USD = 50;
export const SUBLOT_FEE_USD = 100;
/** Клайпеда → Минск, стандартное отправление. Комиссия 3,5% на эту сумму не идёт: она только на перевод в США. */
export const KLAIPEDA_MINSK_USD = 960;
export const KLAIPEDA_MINSK_NOTE =
  "Отдельно оплачивается переоформление авто 2 литра и мотоциклов, которые не оформляются в стандарте. Также возможны небольшие простои.";

/** Поти → Минск по типу машины, прайс «Грузия». Комиссия 3,5% на эту сумму тоже не идёт. Лодки считаются по факту. */
export const POTI_MINSK_RATES = [
  { id: "sedan", label: "Седан", usd: 2200 },
  { id: "suv", label: "Внедорожник", usd: 2300 },
  { id: "big_suv", label: "Big SUV (X7)", usd: 2400 },
  { id: "truck", label: "Фура", usd: 2900 },
  { id: "pickup_truck", label: "Пикап в фуре", usd: 2900 },
  { id: "moto_carrier", label: "Мотоцикл, автовоз", usd: 900 },
  { id: "moto_truck", label: "Мотоцикл, фура", usd: 1000 },
  { id: "atv", label: "Квадроцикл", usd: 1500 },
  { id: "jet_ski", label: "Гидроцикл", usd: 2000 },
] as const;

export type PotiVehicle = (typeof POTI_MINSK_RATES)[number]["id"];

export function defaultPotiVehicle(size: VehicleSize): PotiVehicle {
  if (size === "moto") return "moto_carrier";
  return size === "oversize" ? "big_suv" : "sedan";
}

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
  /** Тип для тарифа Поти → Минск. Не задан: берётся по размеру машины. */
  potiVehicle?: PotiVehicle | null;
  /** Ручной inland / ocean, если площадки нет в прайсе. Нужны оба значения. */
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
  /** Оформление документов */
  docsFeeUsd: number;
  transferFee: number;
  transferFeeRate: number;
  /** Итого расходы США, база для таможни РБ */
  usaWithFees: number;
  /** Порт → Минск. 0, если доставка не посчитана. */
  minskDeliveryUsd: number;
  minskDeliveryLabel: string;
  /** Тип машины в тарифе Поти → Минск */
  minskDeliveryHint: string | null;
  /** Итого с доставкой до Минска (без таможни РБ) */
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

    const manualInland =
      input.inlandUsd != null && input.inlandUsd >= 0 ? round2(input.inlandUsd) : null;
    const manualOcean =
      input.oceanUsd != null && input.oceanUsd >= 0 ? round2(input.oceanUsd) : null;

    let inland: number | null = null;
    let ocean: number | null = null;
    let fromTariff = false;

    if (tariff) {
      inland = round2(tariff.inlandUsd);
      ocean = manualOcean != null ? manualOcean : round2(tariff.oceanUsd);
      fromTariff = true;
    } else if (manualInland != null && manualOcean != null) {
      inland = manualInland;
      ocean = manualOcean;
    }

    if (inland != null && ocean != null) {
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
  } else {
    americaSubtotal = round2(fees.iaaiTotal + titleDocUsd + sublotUsd);
  }

  const dispatchingUsd = USA_DISPATCHING_USD;
  const transferFee = round2(americaSubtotal * USA_TRANSFER_FEE_RATE);
  const docsFeeUsd = USA_DOCS_FEE_USD;
  const usaWithFees = round2(americaSubtotal + dispatchingUsd + docsFeeUsd + transferFee);
  const potiRate =
    delivery?.oceanDestination === "poti"
      ? POTI_MINSK_RATES.find((r) => r.id === (input.potiVehicle ?? defaultPotiVehicle(size)))
      : undefined;
  const minskDeliveryUsd = potiRate?.usd ?? (delivery ? KLAIPEDA_MINSK_USD : 0);

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
    docsFeeUsd,
    transferFee,
    transferFeeRate: USA_TRANSFER_FEE_RATE,
    usaWithFees,
    minskDeliveryUsd,
    minskDeliveryLabel: potiRate ? "Поти → Минск" : "Клайпеда → Минск",
    minskDeliveryHint: potiRate?.label ?? null,
    grandUsd: round2(usaWithFees + minskDeliveryUsd),
  };
}
