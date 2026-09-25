import {
  TRANSFER_FEE_RATE,
  classifyVehicle,
  round2,
} from "./shared";
import { quoteCopartUk } from "./copart-uk";

const IAAI_SERVICE_FEE_STANDARD = 105;
const IAAI_ENVIRONMENTAL_FEE_STANDARD = 15;
const IAAI_SERVICE_FEE_HIGH = 79;
const IAAI_ENVIRONMENTAL_FEE_HIGH = 10;
const IAAI_TITLE_FEE = 20;
const USA_DISPATCHING_USD = 200;
const USA_DISMANTLE_WEIGHT_BASE = 1300;
const USA_DISMANTLE_WEIGHT_PER_KG = 2.2;

export const USA_DISMANTLE_TARIFFS_USD: Record<string, number> = {
  sedan: 4100,
  suv: 4450,
  frame_suv: 4850,
};

const USA_DISMANTLE_ALIASES: Record<string, string> = {
  sedan: "sedan",
  sprinter: "sedan",
  suv: "suv",
  pickup: "frame_suv",
  frame_suv: "frame_suv",
};

const IAAI_BUYER_FEE_BANDS: [number, number, number][] = [
  [49.99, 0, 25],
  [99.99, 0, 45],
  [199.99, 25, 80],
  [299.99, 60, 130],
  [349.99, 85, 137],
  [399.99, 100, 145],
  [449.99, 125, 175],
  [499.99, 135, 185],
  [549.99, 145, 205],
  [599.99, 155, 210],
  [699.99, 170, 240],
  [799.99, 195, 270],
  [899.99, 215, 295],
  [999.99, 230, 320],
  [1199.99, 250, 375],
  [1299.99, 270, 395],
  [1399.99, 285, 410],
  [1499.99, 300, 430],
  [1599.99, 315, 445],
  [1699.99, 330, 465],
  [1799.99, 350, 485],
  [1999.99, 370, 510],
  [2399.99, 390, 535],
  [2499.99, 425, 570],
  [2999.99, 460, 610],
  [3499.99, 505, 655],
  [3999.99, 555, 705],
  [4499.99, 600, 725],
  [4999.99, 625, 750],
  [5499.99, 650, 775],
  [5999.99, 675, 800],
  [6499.99, 700, 825],
  [6999.99, 720, 845],
  [7499.99, 755, 880],
  [7999.99, 775, 900],
  [8499.99, 800, 925],
  [9999.99, 820, 945],
  [11499.99, 850, 1000],
  [11999.99, 860, 1000],
  [12499.99, 875, 1000],
  [14999.99, 890, 1000],
];

const IAAI_VIRTUAL_BID_BANDS: [number, number, number][] = [
  [99.99, 0, 0],
  [499.99, 50, 40],
  [999.99, 65, 55],
  [1499.99, 85, 75],
  [1999.99, 95, 85],
  [3999.99, 110, 100],
  [5999.99, 125, 110],
  [7999.99, 145, 125],
  [Infinity, 160, 140],
];

function getIaaiBuyerFee(price: number, volume: "high" | "standard" = "high"): number {
  const high = volume !== "standard";
  if (price >= 15000) return round2(price * (high ? 0.06 : 0.075));
  for (const [maxPrice, feeHv, feeStd] of IAAI_BUYER_FEE_BANDS) {
    if (price <= maxPrice) return high ? feeHv : feeStd;
  }
  return round2(price * (high ? 0.06 : 0.075));
}

function getIaaiVirtualBidFee(price: number, method: "live" | "proxy" = "live"): number {
  for (const [maxPrice, liveFee, proxyFee] of IAAI_VIRTUAL_BID_BANDS) {
    if (price <= maxPrice) return method === "proxy" ? proxyFee : liveFee;
  }
  return method === "proxy" ? 140 : 160;
}

export function estimateIaaiWholesale(
  bid: number,
  options: { bidMethod?: "live" | "proxy"; volume?: "high" | "standard" } = {},
) {
  const sale = round2(bid);
  const volume = options.volume === "high" ? "high" : "standard";
  const isHigh = volume === "high";
  const buyerHv = getIaaiBuyerFee(sale, "high");
  const buyerStd = getIaaiBuyerFee(sale, "standard");
  const buyer = isHigh ? buyerHv : buyerStd;
  const method = options.bidMethod === "proxy" ? "proxy" : "live";
  const virtual = getIaaiVirtualBidFee(sale, method);
  const service = isHigh ? IAAI_SERVICE_FEE_HIGH : IAAI_SERVICE_FEE_STANDARD;
  const environmental = isHigh ? IAAI_ENVIRONMENTAL_FEE_HIGH : IAAI_ENVIRONMENTAL_FEE_STANDARD;
  const title = IAAI_TITLE_FEE;
  const fixed = round2(service + environmental + title);
  const feesNet = round2(buyer + virtual + fixed);
  const iaaiTotal = round2(sale + feesNet);

  return {
    auction: "iaai" as const,
    market: "US",
    currency: "USD",
    volume,
    volumeLabel: isHigh ? "Опт (High Volume)" : "Standard",
    bid: sale,
    buyerFee: buyer,
    buyerFeeHigh: buyerHv,
    buyerFeeStandard: buyerStd,
    savingVsStandard: isHigh ? round2(buyerStd - buyerHv) : 0,
    bidMethod: method,
    virtualBid: virtual,
    serviceFee: service,
    environmentalFee: environmental,
    titleFee: title,
    fixedFees: fixed,
    feesNet,
    iaaiTotal,
  };
}

export type IaaiQuoteInput = {
  bid: number;
  title?: string;
  bodyStyle?: string | null;
  dismantleType?: string | null;
  dismantleKg?: number | null;
  bidMethod?: "live" | "proxy";
  volume?: "high" | "standard";
  location?: string | null;
  inlandUsd?: number | null;
  inlandMiles?: number | null;
  includeAmericaDelivery?: boolean;
};

export type IaaiQuote = {
  auction: "iaai";
  iaai: ReturnType<typeof estimateIaaiWholesale>;
  deliveryUsa: {
    location: string | null;
    inlandMiles: number | null;
    inlandUsd: number;
    rateUsdPerMile: number;
  } | null;
  subtotalUsa: number;
  dispatchingUsd: number;
  transferFee: number;
  usaWithFees: number;
  dismantleUsd: number;
  dismantleType: string;
  dismantleMode: "tariff" | "weight";
  dismantleKg: number | null;
  vehicleType: string;
  grandUsd: number;
};

export function quoteIaaiUsa(input: IaaiQuoteInput): IaaiQuote | null {
  if (input.bid == null || Number.isNaN(input.bid)) return null;

  const classified = classifyVehicle([input.bodyStyle, input.title].filter(Boolean).join(" "));
  const rawType = String(input.dismantleType ?? classified.dismantleType).toLowerCase();
  const dtype = USA_DISMANTLE_ALIASES[rawType] ?? "sedan";

  const iaai = estimateIaaiWholesale(input.bid, {
    bidMethod: input.bidMethod,
    volume: input.volume,
  });

  const kg = input.dismantleKg && input.dismantleKg > 0 ? input.dismantleKg : null;
  let dismantleUsd: number;
  let dismantleMode: "tariff" | "weight";
  if (kg) {
    dismantleUsd = round2(USA_DISMANTLE_WEIGHT_BASE + USA_DISMANTLE_WEIGHT_PER_KG * kg);
    dismantleMode = "weight";
  } else {
    dismantleUsd = USA_DISMANTLE_TARIFFS_USD[dtype] ?? USA_DISMANTLE_TARIFFS_USD.sedan;
    dismantleMode = "tariff";
  }

  let americaSubtotal = iaai.iaaiTotal;
  let deliveryUsa: IaaiQuote["deliveryUsa"] = null;

  if (input.includeAmericaDelivery !== false) {
    const inland =
      input.inlandUsd != null && input.inlandUsd >= 0
        ? round2(input.inlandUsd)
        : round2(input.inlandMiles ?? 450);
    const miles = input.inlandMiles ?? inland;
    americaSubtotal = round2(iaai.iaaiTotal + inland);
    deliveryUsa = {
      location: input.location ?? null,
      inlandMiles: miles,
      inlandUsd: inland,
      rateUsdPerMile: 1,
    };
  }

  const dispatchingUsd = USA_DISPATCHING_USD;
  const transferFee = round2(americaSubtotal * TRANSFER_FEE_RATE);
  const usaWithFees = round2(americaSubtotal + dispatchingUsd + transferFee);

  return {
    auction: "iaai",
    iaai,
    deliveryUsa,
    subtotalUsa: americaSubtotal,
    dispatchingUsd,
    transferFee,
    usaWithFees,
    dismantleUsd,
    dismantleType: dtype,
    dismantleMode,
    dismantleKg: kg,
    vehicleType: classified.vehicleType,
    grandUsd: round2(usaWithFees + dismantleUsd),
  };
}

export function quoteLot(input: {
  region: "usa" | "uk";
  bid: number;
  location?: string | null;
  category?: string | null;
  title?: string;
  bodyStyle?: string | null;
  vatOnSale?: boolean | null;
  fxRate?: number | null;
  inlandMiles?: number | null;
  inlandUsd?: number | null;
  dismantleType?: string | null;
  dismantleKg?: number | null;
}) {
  if (input.region === "uk") {
    return quoteCopartUk({
      bid: input.bid,
      location: input.location,
      category: input.category,
      title: input.title,
      bodyStyle: input.bodyStyle,
      vatOnSale: input.vatOnSale,
      fxRate: input.fxRate,
      dismantleType: input.dismantleType,
      dismantleKg: input.dismantleKg,
    });
  }
  return quoteIaaiUsa({
    bid: input.bid,
    title: input.title,
    bodyStyle: input.bodyStyle,
    location: input.location,
    inlandMiles: input.inlandMiles,
    inlandUsd: input.inlandUsd,
    dismantleType: input.dismantleType,
    dismantleKg: input.dismantleKg,
    volume: "standard",
    includeAmericaDelivery: true,
  });
}
