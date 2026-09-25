const MI_TO_KM = 1.60934;

/** Convert lot odometer to kilometres (miles × 1.60934). */
export function odometerToKm(
  odometer: number,
  unit: "mi" | "km" = "mi",
): number {
  const n = Number(odometer) || 0;
  if (unit === "km") return Math.round(n);
  return Math.round(n * MI_TO_KM);
}

/** e.g. "45 800 км" */
export function formatOdometerKm(
  odometer: number,
  unit: "mi" | "km" = "mi",
): string {
  return `${odometerToKm(odometer, unit).toLocaleString("ru-RU")} км`;
}
