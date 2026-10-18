/** Согласие с политикой обработки персональных данных при входе в кабинет. */
export const CABINET_POLICY_STORAGE_KEY = "mg_cabinet_policy_v1";
export const CABINET_POLICY_PATH = "/politika-konfidencialnosti/";

export function hasCabinetPolicyConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CABINET_POLICY_STORAGE_KEY) === "accepted";
  } catch {
    return false;
  }
}

export function acceptCabinetPolicyConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CABINET_POLICY_STORAGE_KEY, "accepted");
  } catch {
    /* private mode */
  }
}
