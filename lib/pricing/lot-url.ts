export type LotHost = "iaai" | "bidcars" | "copart_com" | "copart_uk" | "other";

export function lotHost(raw: string): LotHost {
  const u = raw.trim().toLowerCase();
  if (!u) return "other";
  if (u.includes("iaai.com")) return "iaai";
  if (u.includes("bid.cars")) return "bidcars";
  if (u.includes("copart.co.uk")) return "copart_uk";
  if (u.includes("copart.com")) return "copart_com";
  return "other";
}

/** Машинокомплект США: IAAI, Bid.cars, Copart.com. */
export function usaKitLotUrlError(raw: string): string | null {
  const host = lotHost(raw);
  if (!raw.trim()) return "Вставьте ссылку IAAI, Bid.cars или Copart.com";
  if (host === "copart_uk") return "Это лот из Англии. Он считается в калькуляторе «Англия»";
  if (host === "other") return "Для США нужна ссылка IAAI, Bid.cars или Copart.com";
  return null;
}

/** Машинокомплект Англия: только Copart UK. */
export function ukKitLotUrlError(raw: string): string | null {
  const host = lotHost(raw);
  if (!raw.trim()) return "Вставьте ссылку Copart UK";
  if (host === "bidcars" || host === "iaai" || host === "copart_com") {
    return "Машинокомплект из Англии считается только по Copart UK. IAAI, Bid.cars и Copart.com — в калькуляторе «США»";
  }
  if (host !== "copart_uk") return "Для Англии нужна ссылка Copart UK";
  return null;
}

/** Машинокомплект: США и Англия. */
export function kitLotUrlError(raw: string): string | null {
  if (!raw.trim()) return "Вставьте ссылку IAAI, Bid.cars, Copart.com или Copart UK";
  if (lotHost(raw) === "other") {
    return "Машинокомплект считается по ссылке IAAI, Bid.cars, Copart.com или Copart UK";
  }
  return null;
}

/** Авто под восстановление: только США. */
export function restorationLotUrlError(raw: string): string | null {
  const host = lotHost(raw);
  if (!raw.trim()) return "Вставьте ссылку IAAI, Bid.cars или Copart.com";
  if (host === "copart_uk") {
    return "Авто под восстановление считается только по США: IAAI, Bid.cars или Copart.com";
  }
  if (host === "other") return "Нужна ссылка IAAI, Bid.cars или Copart.com";
  return null;
}
