export type PurchasedCarCurrency = "USD" | "GBP";

export type PurchasedCar = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  image: string;
  source: string;
  region: "США" | "Англия" | "Китай" | "Корея";
  purchasedAt: string;
  damage: string;
  odometer: string;
  /** Ставка + аукционные сборы (из калькулятора) */
  auctionPrice: number;
  /** Доставка (из калькулятора) */
  delivery: number;
  /** Разбор (из калькулятора) */
  dismantle: number;
  /** Доставка + разбор + прочие сборы (без аукциона) */
  deliveryAndFees: number;
  totalCost: number;
  marketBy: number;
  currency: PurchasedCarCurrency;
  href?: string;
};

export function formatMoney(amount: number, currency: PurchasedCarCurrency) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function savingsPercent(car: PurchasedCar) {
  if (car.marketBy <= 0) return 0;
  return Math.round(((car.marketBy - car.totalCost) / car.marketBy) * 100);
}

export function purchasedCarsSummary(cars: PurchasedCar[]) {
  const normalized = cars.map((car) =>
    car.currency === "GBP"
      ? {
          ...car,
          auctionPrice: Math.round(car.auctionPrice * 1.29),
          delivery: Math.round(car.delivery * 1.29),
          dismantle: Math.round(car.dismantle * 1.29),
          deliveryAndFees: Math.round(car.deliveryAndFees * 1.29),
          totalCost: Math.round(car.totalCost * 1.29),
          marketBy: Math.round(car.marketBy * 1.29),
          currency: "USD" as const,
        }
      : car,
  );
  const totalUsd = normalized.reduce((sum, car) => sum + car.totalCost, 0);
  const savedUsd = normalized.reduce((sum, car) => sum + (car.marketBy - car.totalCost), 0);
  const avgSavings =
    normalized.length === 0
      ? 0
      : Math.round(normalized.reduce((sum, car) => sum + savingsPercent(car), 0) / normalized.length);

  return {
    count: cars.length,
    totalUsd,
    savedUsd,
    avgSavings,
  };
}
