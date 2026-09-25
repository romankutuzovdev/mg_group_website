import { apiUrl, isApiEnabled } from "@/lib/api/config";
import { ApiError } from "@/lib/api/client";

const TOKEN_KEY = "mg_cabinet_token";

export type CabinetUser = {
  id: number;
  telegram_id: number;
  username: string;
  first_name: string;
  last_name: string;
  photo_url: string;
  is_admin: boolean;
  created_at: string;
};

export type StageKey =
  | "selection"
  | "auction"
  | "origin"
  | "ocean"
  | "belarus"
  | "delivery";

export type OriginRegion = "usa" | "uk" | "china" | "korea";
export type OriginPoint = "dismantle" | "port";
export type DealKind = "car" | "kit";

export type DealStage = {
  key: StageKey;
  label: string;
  status: "pending" | "active" | "done";
  note: string;
  updated_at: string | null;
};

export type DealMedia = {
  id: number;
  deal_id: number;
  stage_key: StageKey | null;
  kind: "photo" | "document";
  url: string;
  filename: string;
  caption: string;
  created_at: string;
};

export type Deal = {
  id: number;
  title: string;
  vin: string;
  lot_number: string;
  status: "active" | "completed" | "cancelled";
  note: string;
  price?: number;
  currency?: "USD" | "GBP";
  kind?: DealKind;
  origin_region: OriginRegion;
  origin_point: OriginPoint;
  client_telegram_id?: number;
  client_name?: string;
  client_username?: string;
  manager_telegram_id?: number;
  payment_stage1_paid?: boolean;
  payment_stage1_at?: string | null;
  payment_stage2_paid?: boolean;
  payment_stage2_at?: string | null;
  created_at: string;
  updated_at: string;
  stages: DealStage[];
  media: DealMedia[];
};

export const MAP_STAGE_KEYS: StageKey[] = ["origin", "ocean", "belarus", "delivery"];

export const ORIGIN_REGION_LABELS: Record<OriginRegion, string> = {
  usa: "США",
  uk: "Англия",
  china: "Китай",
  korea: "Корея",
};

export const DEAL_KIND_LABELS: Record<DealKind, string> = {
  car: "Авто",
  kit: "Машинокомплект",
};

export function dealKind(deal: Deal): DealKind {
  if (deal.kind === "car" || deal.kind === "kit") return deal.kind;
  return deal.origin_point === "port" ? "car" : "kit";
}

export function regionLabel(region: OriginRegion | string): string {
  return ORIGIN_REGION_LABELS[region as OriginRegion] || region;
}

export type TelegramLoginUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export function getCabinetToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setCabinetToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (!token) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
}

async function cabinetFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isApiEnabled()) {
    throw new ApiError("API URL is not configured (NEXT_PUBLIC_API_URL)", 0);
  }
  const token = getCabinetToken();
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(`API ${res.status}: ${path}`, res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function fetchTelegramAuthConfig(): Promise<{
  bot_username: string;
  enabled: boolean;
  dev_enabled?: boolean;
}> {
  return cabinetFetch("/api/v1/auth/telegram/config");
}

export async function loginWithTelegram(
  user: TelegramLoginUser,
): Promise<{ access_token: string; user: CabinetUser }> {
  const data = await cabinetFetch<{ access_token: string; user: CabinetUser }>(
    "/api/v1/auth/telegram",
    {
      method: "POST",
      body: JSON.stringify({
        id: user.id,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        username: user.username || "",
        photo_url: user.photo_url || "",
        auth_date: user.auth_date,
        hash: user.hash,
      }),
    },
  );
  setCabinetToken(data.access_token);
  return data;
}

/** Silent login for Telegram Mini App (`Telegram.WebApp.initData`). */
export async function loginWithTelegramWebApp(
  initData: string,
): Promise<{ access_token: string; user: CabinetUser }> {
  const data = await cabinetFetch<{ access_token: string; user: CabinetUser }>(
    "/api/v1/auth/telegram/webapp",
    {
      method: "POST",
      body: JSON.stringify({ init_data: initData }),
    },
  );
  setCabinetToken(data.access_token);
  return data;
}

export async function loginDev(
  role: "manager" | "client" = "manager",
): Promise<{ access_token: string; user: CabinetUser }> {
  const qs = role === "client" ? "?role=client" : "?role=manager";
  const data = await cabinetFetch<{ access_token: string; user: CabinetUser }>(
    `/api/v1/auth/dev${qs}`,
    { method: "POST" },
  );
  setCabinetToken(data.access_token);
  return data;
}

export async function fetchMe(): Promise<CabinetUser> {
  return cabinetFetch("/api/v1/me");
}

export async function fetchMyDeals(): Promise<Deal[]> {
  return cabinetFetch("/api/v1/me/deals");
}

export async function fetchMyDeal(id: number): Promise<Deal> {
  return cabinetFetch(`/api/v1/me/deals/${id}`);
}

export async function fetchAdminUsers(): Promise<CabinetUser[]> {
  return cabinetFetch("/api/v1/admin/users");
}

export async function fetchAdminDeals(): Promise<Deal[]> {
  return cabinetFetch("/api/v1/admin/deals");
}

export async function adminCreateDeal(body: {
  telegram_id: number;
  title: string;
  vin?: string;
  lot_number?: string;
  note?: string;
  price?: number;
  currency?: "USD" | "GBP";
  status?: Deal["status"];
  kind?: DealKind;
  origin_region?: OriginRegion;
  origin_point?: OriginPoint;
}): Promise<Deal> {
  return cabinetFetch("/api/v1/admin/deals", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function adminUpdateDeal(
  dealId: number,
  body: Partial<{
    title: string;
    vin: string;
    lot_number: string;
    note: string;
    price: number;
    currency: "USD" | "GBP";
    status: Deal["status"];
    kind: DealKind;
    origin_region: OriginRegion;
    origin_point: OriginPoint;
  }>,
): Promise<Deal> {
  return cabinetFetch(`/api/v1/admin/deals/${dealId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function adminUpdatePayment(
  dealId: number,
  body: { stage: 1 | 2; paid: boolean },
): Promise<Deal> {
  return cabinetFetch(`/api/v1/admin/deals/${dealId}/payment`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function adminUpdateStage(
  dealId: number,
  stageKey: StageKey,
  body: { status: DealStage["status"]; note?: string },
): Promise<Deal> {
  return cabinetFetch(`/api/v1/admin/deals/${dealId}/stages/${stageKey}`, {
    method: "POST",
    body: JSON.stringify({ status: body.status, note: body.note || "" }),
  });
}

export async function adminUploadDealMedia(
  dealId: number,
  file: File,
  stageKey?: StageKey | null,
  caption = "",
): Promise<DealMedia> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "photo");
  if (stageKey) form.append("stage_key", stageKey);
  form.append("caption", caption);
  return cabinetFetch(`/api/v1/admin/deals/${dealId}/media`, {
    method: "POST",
    body: form,
  });
}

export function mediaAbsoluteUrl(path: string): string {
  const token = getCabinetToken();
  const base = path.startsWith("http") ? path : apiUrl(path);
  if (!token) return base;
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}access_token=${encodeURIComponent(token)}`;
}

export type PurchasedWholeCarAdmin = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  image: string;
  source: string;
  region: "США" | "Англия";
  purchasedAt: string;
  damage: string;
  odometer: string;
  auctionPrice: number;
  delivery: number;
  dismantle: number;
  deliveryAndFees: number;
  totalCost: number;
  marketBy: number;
  currency: "USD" | "GBP";
  href: string | null;
  note: string;
  published: boolean;
  createdAt: string;
};

export type PurchasedWholeCarPayload = {
  year: number;
  make: string;
  model: string;
  trim?: string;
  image_url?: string;
  source?: string;
  region?: "США" | "Англия";
  purchased_at?: string;
  damage?: string;
  odometer?: string;
  auction_price?: number;
  delivery?: number;
  dismantle?: number;
  delivery_and_fees?: number | null;
  total_cost?: number | null;
  market_by?: number;
  currency?: "USD" | "GBP";
  href?: string;
  note?: string;
  published?: boolean;
};

function resolveAdminMedia(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return apiUrl(path);
}

export async function adminListPurchasedCars(): Promise<PurchasedWholeCarAdmin[]> {
  const data = await cabinetFetch<{ items: PurchasedWholeCarAdmin[] }>(
    "/api/v1/admin/purchased-cars",
  );
  return data.items.map((item) => ({
    ...item,
    image: resolveAdminMedia(item.image),
  }));
}

export async function adminCreatePurchasedCar(
  body: PurchasedWholeCarPayload,
): Promise<PurchasedWholeCarAdmin> {
  const car = await cabinetFetch<PurchasedWholeCarAdmin>("/api/v1/admin/purchased-cars", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { ...car, image: resolveAdminMedia(car.image) };
}

export async function adminDeletePurchasedCar(id: string): Promise<void> {
  await cabinetFetch(`/api/v1/admin/purchased-cars/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function adminUploadPurchasedCarPhoto(
  id: string,
  file: File,
): Promise<PurchasedWholeCarAdmin> {
  const form = new FormData();
  form.append("file", file);
  const car = await cabinetFetch<PurchasedWholeCarAdmin>(
    `/api/v1/admin/purchased-cars/${encodeURIComponent(id)}/photo`,
    { method: "POST", body: form },
  );
  return { ...car, image: resolveAdminMedia(car.image) };
}

export type FavoriteLot = {
  lot_id: string;
  slug: string;
  title: string;
  year: number;
  make: string;
  model: string;
  image_url: string;
  current_bid: number;
  currency: string;
  auction_date: string;
  region: string;
  source: string;
  created_at: string;
};

export async function fetchFavorites(): Promise<FavoriteLot[]> {
  return cabinetFetch("/api/v1/favorites");
}

export async function fetchFavoriteIds(): Promise<string[]> {
  const data = await cabinetFetch<{ ids: string[] }>("/api/v1/favorites/ids");
  return data.ids || [];
}

export async function addFavorite(lotId: string): Promise<FavoriteLot> {
  return cabinetFetch("/api/v1/favorites", {
    method: "POST",
    body: JSON.stringify({ lot_id: lotId }),
  });
}

export async function removeFavorite(lotId: string): Promise<void> {
  await cabinetFetch(`/api/v1/favorites/${encodeURIComponent(lotId)}`, {
    method: "DELETE",
  });
}

export type DismantleCell = {
  key: string;
  num: number | null;
  section: string;
  name: string;
  qty: string;
  packing: string;
  note: string;
  is_note_only: boolean;
};

export type DismantleMap = {
  deal_id: number;
  title: string;
  vehicle_label: string;
  vehicle_header_hint: string;
  sections: string[];
  cells: DismantleCell[];
  updated_at: string | null;
  completed?: boolean;
  completed_at?: string | null;
};

export async function fetchDismantleMap(dealId: number): Promise<DismantleMap> {
  return cabinetFetch(`/api/v1/me/deals/${dealId}/dismantle-map`);
}

export async function patchDismantleMeta(
  dealId: number,
  body: { vehicle_label?: string; completed?: boolean },
): Promise<DismantleMap> {
  return cabinetFetch(`/api/v1/me/deals/${dealId}/dismantle-map`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function patchDismantleCell(
  dealId: number,
  itemKey: string,
  body: { qty?: string; packing?: string; note?: string },
): Promise<DismantleCell> {
  return cabinetFetch(
    `/api/v1/me/deals/${dealId}/dismantle-map/cells/${encodeURIComponent(itemKey)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export async function downloadDismantleMapXlsx(dealId: number): Promise<void> {
  if (!isApiEnabled()) {
    throw new ApiError("API URL is not configured (NEXT_PUBLIC_API_URL)", 0);
  }
  const token = getCabinetToken();
  const res = await fetch(apiUrl(`/api/v1/me/deals/${dealId}/dismantle-map.xlsx`), {
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(`API ${res.status}: dismantle-map.xlsx`, res.status, text);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(cd);
  const filename = match?.[1] || `karta_razbora_${dealId}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
