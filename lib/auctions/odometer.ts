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

/** Аукционы ставят 999 999, когда пробег не читается (нерабочая панель и т. п.). */
const ODOMETER_PLACEHOLDER_MIN = 999_000;

export const ODOMETER_UNKNOWN_LABEL = "Не определён";

export function isOdometerKnown(odometer: number): boolean {
  return (Number(odometer) || 0) < ODOMETER_PLACEHOLDER_MIN;
}

/** e.g. "45 800 км" */
export function formatOdometerKm(
  odometer: number,
  unit: "mi" | "km" = "mi",
): string {
  if (!isOdometerKnown(odometer)) return ODOMETER_UNKNOWN_LABEL;
  return `${odometerToKm(odometer, unit).toLocaleString("ru-RU")} км`;
}
