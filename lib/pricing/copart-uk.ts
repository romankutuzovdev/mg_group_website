import {
  DISMANTLE_FROM_TYPE,
  DISMANTLE_TARIFFS_USD,
  TRANSFER_FEE_RATE,
  classifyVehicle,
  getDelivery,
  isCategoryB,
  round2,
} from "./shared";

const VAT_RATE = 0.2;
const LOT_RETRIEVAL_FEE = 50;

const BUYER_FEE_BANDS: [number, number, number][] = [
  [49.99, 5, 20],
  [99.99, 20, 65],
  [199.99, 45, 85],
  [299.99, 65, 105],
  [349.99, 75, 115],
  [399.99, 85, 125],
  [449.99, 95, 135],
  [499.99, 100, 140],
  [549.99, 105, 145],
  [599.99, 115, 150],
  [699.99, 125, 165],
  [799.99, 140, 180],
  [899.99, 155, 195],
  [999.99, 170, 210],
  [1199.99, 185, 225],
  [1299.99, 205, 245],
  [1399.99, 215, 255],
  [1499.99, 225, 265],
  [1599.99, 235, 275],
  [1699.99, 245, 285],
  [1799.99, 260, 300],
  [1999.99, 270, 310],
  [2399.99, 300, 340],
  [2499.99, 325, 365],
  [2999.99, 350, 390],
  [3499.99, 385, 425],
  [3999.99, 425, 465],
  [4499.99, 470, 510],
  [4999.99, 495, 535],
  [5999.99, 515, 555],
  [7499.99, 525, 565],
  [9999.99, 550, 590],
];

const LIVE_BID_FEE_BANDS: [number, number][] = [
  [99.99, 0],
  [499.99, 35],
  [999.99, 49],
  [1499.99, 69],
  [1999.99, 79],
  [3999.99, 89],
  [5999.99, 99],
  [7999.99, 105],
  [Infinity, 109],
];

const DISMANTLE_WEIGHT_BASE = 800;
const DISMANTLE_WEIGHT_PER_KG = 1.6;

function getBuyerFee(price: number, tier: "A" | "B" = "A"): number {
  if (price >= 10000) return round2(price * (tier === "B" ? 0.065 : 0.055));
  for (const [maxPrice, feeA, feeB] of BUYER_FEE_BANDS) {
    if (price <= maxPrice) return tier === "B" ? feeB : feeA;
  }
  return BUYER_FEE_BANDS[BUYER_FEE_BANDS.length - 1][1];
}

function getLiveBidFee(price: number): number {
  for (const [maxPrice, fee] of LIVE_BID_FEE_BANDS) {
    if (price <= maxPrice) return fee;
  }
  return 109;
}

export function estimateCopartWholesale(bid: number, vatOnSale: boolean) {
  const sale = round2(bid);
  const buyerA = getBuyerFee(sale, "A");
  const buyerB = getBuyerFee(sale, "B");
  const liveBid = getLiveBidFee(sale);
  const retrieval = LOT_RETRIEVAL_FEE;
  const feesNet = round2(buyerA + liveBid + retrieval);
  const vatFees = round2(feesNet * VAT_RATE);
  const vatSale = vatOnSale ? round2(sale * VAT_RATE) : 0;
  const copartTotal = round2(sale + feesNet + vatFees + vatSale);
  return {
    bid: sale,
    buyerA,
    buyerB,
    saving: round2(buyerB - buyerA),
    liveBid,
    retrieval,
    feesNet,
    vatFees,
    vatSale,
    vatOnSale: Boolean(vatOnSale),
    vatSum: round2(vatFees + vatSale),
    copartTotal,
  };
}

export type CopartQuoteInput = {
  bid: number;
  location?: string | null;
  category?: string | null;
  title?: string;
  bodyStyle?: string | null;
  vatOnSale?: boolean | null;
  dismantleType?: string | null;
  dismantleKg?: number | null;
  deliveryColumn?: string | null;
  fxRate?: number | null;
  fxMarketRate?: number | null;
};

export type CopartQuote = {
  copart: ReturnType<typeof estimateCopartWholesale>;
  delivery: ReturnType<typeof getDelivery>;
  subtotal: number;
  transferFee: number;
  totalUk: number;
  dismantleUsd: number;
  dismantleType: string;
  dismantleMode: "tariff" | "weight";
  dismantleKg: number | null;
  vehicleType: string;
  categoryB: boolean;
  fxRate: number | null;
  fxMarketRate: number | null;
  englandUsd: number | null;
  grandUsd: number | null;
};

export function quoteCopartUk(input: CopartQuoteInput): CopartQuote | null {
  if (input.bid == null || Number.isNaN(input.bid)) return null;

  let classified = classifyVehicle([input.bodyStyle, input.title].filter(Boolean).join(" "));
  const dtype = String(input.dismantleType ?? "")
    .trim()
    .toLowerCase();
  if (dtype in DISMANTLE_TARIFFS_USD) {
    classified = {
      vehicleType: DISMANTLE_FROM_TYPE[dtype] ?? classified.vehicleType,
      dismantleType: dtype,
      matched: true,
    };
  }

  const categoryB = isCategoryB(input.category, input.title);
  const vat = Boolean(categoryB || input.vatOnSale);
  const copart = estimateCopartWholesale(input.bid, vat);
  const delivery = getDelivery(
    input.location,
    classified.dismantleType,
    categoryB,
    input.deliveryColumn,
  );
  const subtotal = round2(copart.copartTotal + delivery.amount);
  const transferFee = round2(subtotal * TRANSFER_FEE_RATE);
  const totalUk = round2(subtotal + transferFee);

  const kg = input.dismantleKg && input.dismantleKg > 0 ? input.dismantleKg : null;
  let dismantleUsd: number;
  let dismantleMode: "tariff" | "weight";
  if (kg) {
    dismantleUsd = round2(DISMANTLE_WEIGHT_BASE + DISMANTLE_WEIGHT_PER_KG * kg);
    dismantleMode = "weight";
  } else {
    dismantleUsd = DISMANTLE_TARIFFS_USD[classified.dismantleType] ?? DISMANTLE_TARIFFS_USD.sedan;
    dismantleMode = "tariff";
  }

  const result: CopartQuote = {
    copart,
    delivery,
    subtotal,
    transferFee,
    totalUk,
    dismantleUsd,
    dismantleType: classified.dismantleType,
    dismantleMode,
    dismantleKg: kg,
    vehicleType: classified.vehicleType,
    categoryB,
    fxRate: null,
    fxMarketRate: null,
    englandUsd: null,
    grandUsd: null,
  };

  if (input.fxRate != null && input.fxRate > 0) {
    const rate = input.fxRate;
    result.fxRate = rate;
    result.fxMarketRate = input.fxMarketRate ?? null;
    result.englandUsd = round2(totalUk * rate);
    result.grandUsd = round2(result.englandUsd + dismantleUsd);
  }

  return result;
}
