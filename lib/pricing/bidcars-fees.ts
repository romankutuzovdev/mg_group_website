/**
 * Аукционный сбор «как на Bid.cars».
 *
 * Перенос блока «Final Price Calculator» со страницы лота Bid.cars
 * (bid.cars/js/new/calculator.js: calculateAuctionFees / calculateCopartFees /
 * calculateIAAIFees). Сбор = buyer fee (таблица по ставке) + internet bid fee
 * + фиксированные сборы площадки.
 *
 * Снято 2026-11-09, лот IAAI: $3 000 → $765, $8 000 → $1 110, $15 000 → $1 210.
 */

export type BidcarsAuction = "iaai" | "copart";

/** Профиль сборов со страницы Bid.cars (глобалы auctionType / isHeavy / custom_fees). */
export type BidcarsFeeProfile = {
  auction: BidcarsAuction;
  /** isHeavy == "1" или custom_fees 3 (IAAI) / 4 (Copart) — грузовые. */
  heavy?: boolean;
  /** custom_fees == "2" — IAAI Rec Rides (мото / техника). */
  recRides?: boolean;
  /** custom_fees == "1" — Copart Crashed Toys. */
  crashedToys?: boolean;
};

export type BidcarsAuctionFees = {
  auction: BidcarsAuction;
  bid: number;
  /** Buyer Fee */
  buyerFee: number;
  /** Internet Bid Fee */
  internetBidFee: number;
  /** IAAI: Service Fee $105 · Copart: Gate Fee $95 */
  serviceFee: number;
  /** IAAI: $25 · Copart: $15 */
  environmentalFee: number;
  /** IAAI: Title Handling $20 · Copart: Title Pickup $20 */
  titleFee: number;
  /** Итого аукционный сбор */
  total: number;
  /** Строки как в подсказке Bid.cars (Buyer Fee: $800 · …) */
  lines: { label: string; amount: number }[];
};

type Band = [max: number, fee: number];

/** buyerFeeIAAI — стандартная таблица IAAI. Выше последней ступени: 6%. */
const IAAI_BUYER: Band[] = [
  [100, 1], [200, 25], [300, 60], [350, 85], [400, 100], [450, 125], [500, 135],
  [550, 145], [600, 155], [700, 170], [800, 195], [900, 215], [1000, 230],
  [1200, 250], [1300, 270], [1400, 285], [1500, 300], [1600, 315], [1700, 330],
  [1800, 350], [2000, 370], [2400, 390], [2500, 425], [3000, 460], [3500, 505],
  [4000, 555], [4500, 600], [5000, 625], [5500, 650], [6000, 675], [6500, 700],
  [7000, 720], [7500, 755], [8000, 775], [8500, 800], [10000, 820], [11500, 850],
  [12000, 860], [12500, 875], [15000, 890],
];

/** buyerFeeCopart — стандартная таблица Copart. Выше последней ступени: 6%. */
const COPART_BUYER: Band[] = [
  [50, 1], [100, 1], [200, 25], [300, 60], [350, 85], [400, 100], [450, 125],
  [500, 135], [550, 145], [600, 155], [700, 170], [800, 195], [900, 215],
  [1000, 230], [1200, 250], [1300, 270], [1400, 285], [1500, 300], [1600, 315],
  [1700, 330], [1800, 350], [2000, 370], [2400, 390], [2500, 425], [3000, 460],
  [3500, 505], [4000, 555], [4500, 600], [5000, 625], [5500, 650], [6000, 675],
  [6500, 700], [7000, 720], [7500, 755], [8000, 775], [8500, 800], [9000, 820],
  [10000, 820], [10500, 850], [11000, 850], [11500, 850], [12000, 860],
  [12500, 875], [15000, 890],
];

/** buyerFeeHeavyVehiclesIAAI / buyerFeeHeavyVehiclesCopart. Выше: 10%. */
const HEAVY_BUYER: Band[] = [
  [100, 1], [200, 25], [300, 60], [350, 85], [400, 100], [450, 125], [500, 135],
  [550, 145], [600, 155], [700, 170], [800, 195], [900, 215], [1000, 230],
  [1200, 250], [1300, 270], [1400, 285], [1500, 300], [1600, 315], [1700, 330],
  [1800, 350], [2000, 370], [2400, 390], [2500, 425], [3000, 460], [3500, 505],
  [4000, 555], [4500, 600], [5000, 625], [5500, 650], [6000, 675], [6500, 700],
  [7000, 720], [7500, 755], [8000, 775],
];

/** buyerFeeIAAIRecRides. Выше: 10.5%. */
const IAAI_REC_RIDES_BUYER: Band[] = [
  [50, 30], [100, 45], [200, 70], [300, 100], [400, 120], [500, 150], [600, 170],
  [700, 195], [800, 225], [900, 245], [1000, 265], [1200, 290], [1400, 325],
  [1600, 350], [1800, 375], [2000, 425], [2200, 450], [2500, 475], [3000, 500],
  [3500, 575], [4000, 600], [5000, 650], [6000, 700], [7000, 750], [8000, 825],
  [9000, 900], [10000, 975],
];

/** buyerFeeCopartCrashedToys. Выше: 10.5%. */
const COPART_CRASHED_TOYS_BUYER: Band[] = [
  [50, 30], [100, 45], [200, 70], [300, 105], [350, 130], [400, 132.5], [450, 145],
  [500, 150], [550, 165], [600, 170], [700, 190], [800, 225], [900, 250],
  [1000, 270], [1200, 300], [1300, 335], [1400, 335], [1500, 360], [1600, 370],
  [1700, 400], [1800, 415], [2000, 465], [2400, 500], [2500, 510], [3000, 570],
  [3500, 695], [4000, 710], [4500, 710], [5000, 720], [5500, 780], [6000, 815],
  [6500, 850], [7000, 880], [7500, 900], [8000, 1020], [9000, 1025], [10000, 1050],
];

/** internetBidFeeIAAI / internetBidFeeCopart — одинаковые. Выше: $160. */
const INTERNET_BID: Band[] = [
  [100, 0], [500, 50], [1000, 65], [1500, 85], [2000, 95], [4000, 110],
  [6000, 125], [8000, 145],
];

const FIXED: Record<BidcarsAuction, { service: number; environmental: number; title: number }> = {
  iaai: { service: 105, environmental: 25, title: 20 },
  copart: { service: 95, environmental: 15, title: 20 },
};

function fromBands(bands: Band[], price: number, above: number | ((price: number) => number)): number {
  for (const [max, fee] of bands) {
    if (price < max) return fee;
  }
  return typeof above === "function" ? above(price) : above;
}

const pct = (rate: number) => (price: number) => price * rate;

function buyerFee(price: number, profile: BidcarsFeeProfile): number {
  if (profile.heavy) return fromBands(HEAVY_BUYER, price, pct(0.1));
  if (profile.auction === "copart") {
    if (profile.crashedToys) return fromBands(COPART_CRASHED_TOYS_BUYER, price, pct(0.105));
    return fromBands(COPART_BUYER, price, pct(0.06));
  }
  if (profile.recRides) return fromBands(IAAI_REC_RIDES_BUYER, price, pct(0.105));
  return fromBands(IAAI_BUYER, price, pct(0.06));
}

function r0(n: number) {
  return Math.round(n);
}

export function estimateBidcarsAuctionFees(
  bid: number,
  profile: BidcarsFeeProfile | BidcarsAuction = "iaai",
): BidcarsAuctionFees {
  const p: BidcarsFeeProfile = typeof profile === "string" ? { auction: profile } : profile;
  const auction: BidcarsAuction = p.auction === "copart" ? "copart" : "iaai";
  const price = Number.isFinite(bid) && bid > 0 ? Math.floor(bid) : 0;
  const buyer = r0(buyerFee(price, { ...p, auction }));
  const internetBidFee = r0(fromBands(INTERNET_BID, price, 160));
  const fixed = FIXED[auction];
  const total = r0(buyer + internetBidFee + fixed.service + fixed.environmental + fixed.title);
  const lines =
    auction === "iaai"
      ? [
          { label: "Buyer Fee", amount: buyer },
          { label: "Internet Bid Fee", amount: internetBidFee },
          { label: "Service Fee", amount: fixed.service },
          { label: "Environmental Fee", amount: fixed.environmental },
          { label: "Title Handling Fee", amount: fixed.title },
        ]
      : [
          { label: "Buyer Fee", amount: buyer },
          { label: "Internet Bid Fee", amount: internetBidFee },
          { label: "Gate Fee", amount: fixed.service },
          { label: "Environmental Fee", amount: fixed.environmental },
          { label: "Title Pickup Fee", amount: fixed.title },
        ];
  return {
    auction,
    bid: price,
    buyerFee: buyer,
    internetBidFee,
    serviceFee: fixed.service,
    environmentalFee: fixed.environmental,
    titleFee: fixed.title,
    total,
    lines,
  };
}

/** Только сумма сбора, как в строке «2 Auction Fees» на Bid.cars. */
export function estimateBidcarsAuctionFeesUsd(
  bid: number,
  profile: BidcarsFeeProfile | BidcarsAuction = "iaai",
): number {
  return estimateBidcarsAuctionFees(bid, profile).total;
}

/** Профиль сборов из ответа /lot-from-url (поле bidcarsFees) или по площадке. */
export function bidcarsFeeProfileFrom(
  raw: { auctionType?: string | null; isHeavy?: boolean | null; customFees?: string | number | null } | null | undefined,
  fallbackAuction: BidcarsAuction,
): BidcarsFeeProfile {
  const auction: BidcarsAuction =
    String(raw?.auctionType || "").toLowerCase() === "copart"
      ? "copart"
      : String(raw?.auctionType || "").toLowerCase() === "iaai"
        ? "iaai"
        : fallbackAuction;
  const custom = raw?.customFees == null ? "" : String(raw.customFees);
  return {
    auction,
    heavy: Boolean(raw?.isHeavy) || (auction === "iaai" ? custom === "3" : custom === "4"),
    recRides: auction === "iaai" && custom === "2",
    crashedToys: auction === "copart" && custom === "1",
  };
}
