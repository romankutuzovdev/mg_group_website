/**
 * Выгода vs рынок РБ: 20–30% на карточке, средняя по пулу ≈ 29%.
 * market = turnkey / (1 - savings/100)
 */
const SAVINGS_BUCKET = [20, 25, 28, 29, 29, 30, 30, 30, 29, 30, 30] as const;
// avg ≈ 28.2, с уклоном к 29–30

export function marketSavingsPercent(seed: number): number {
  return SAVINGS_BUCKET[seed % SAVINGS_BUCKET.length];
}

export function marketPriceFromTurnkey(turnkeyAmount: number, seed: number): number {
  const savingsPct = marketSavingsPercent(seed);
  const market = turnkeyAmount / (1 - savingsPct / 100);
  return Math.max(turnkeyAmount + 1, Math.round(market));
}
