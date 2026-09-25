import type { AuctionLot } from "@/lib/auctions/types";
import { apiUrl, isApiEnabled } from "@/lib/api/config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isApiEnabled()) {
    throw new ApiError("API URL is not configured (NEXT_PUBLIC_API_URL)", 0);
  }
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(`API ${res.status}: ${path}`, res.status, text);
  }
  return (await res.json()) as T;
}

export type LotListApiResponse = {
  items: AuctionLot[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  counts?: Record<string, number>;
};

export type LotQuery = {
  q?: string;
  make?: string;
  model?: string;
  yearFrom?: number;
  yearTo?: number;
  auction?: string[];
  priceMin?: number;
  priceMax?: number;
  body?: string;
  damage?: string;
  region?: string;
  tab?: string;
  run?: boolean;
  buynow?: boolean;
  page?: number;
  pageSize?: number;
  sort?: "date" | "price" | "year";
  order?: "asc" | "desc";
};

function toSearchParams(query: LotQuery): string {
  const sp = new URLSearchParams();
  const set = (k: string, v: string | number | boolean | undefined) => {
    if (v === undefined || v === "") return;
    sp.set(k, String(v));
  };
  set("q", query.q);
  set("make", query.make);
  set("model", query.model);
  set("yearFrom", query.yearFrom);
  set("yearTo", query.yearTo);
  set("priceMin", query.priceMin);
  set("priceMax", query.priceMax);
  set("body", query.body);
  set("damage", query.damage);
  set("region", query.region);
  set("tab", query.tab);
  set("page", query.page);
  set("pageSize", query.pageSize);
  set("sort", query.sort);
  set("order", query.order);
  if (query.run) sp.set("run", "true");
  if (query.buynow) sp.set("buynow", "true");
  for (const a of query.auction ?? []) sp.append("auction", a);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function fetchLotsPage(query: LotQuery = {}): Promise<LotListApiResponse> {
  return apiFetch<LotListApiResponse>(`/api/v1/lots${toSearchParams(query)}`);
}

/** Load full catalog (paginated under the hood). */
export async function fetchAllLots(pageSize = 100): Promise<AuctionLot[]> {
  const first = await fetchLotsPage({ page: 1, pageSize, sort: "date", order: "desc" });
  if (first.pages <= 1) return first.items;
  const rest: AuctionLot[] = [...first.items];
  for (let page = 2; page <= first.pages; page++) {
    const next = await fetchLotsPage({ page, pageSize, sort: "date", order: "desc" });
    rest.push(...next.items);
  }
  return rest;
}

export async function fetchFeaturedLots(limit = 4): Promise<AuctionLot[]> {
  return apiFetch<AuctionLot[]>(`/api/v1/lots/featured?limit=${limit}`);
}

export async function fetchLotBySlug(slug: string): Promise<AuctionLot | null> {
  try {
    return await apiFetch<AuctionLot>(`/api/v1/lots/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function fetchLotMeta(): Promise<{
  total: number;
  makes: string[];
  counts_by_region: Record<string, number>;
  counts_by_source: Record<string, number>;
}> {
  return apiFetch("/api/v1/lots/meta");
}

export async function fetchLotSlugs(): Promise<string[]> {
  const lots = await fetchAllLots(100);
  return lots.map((l) => l.slug);
}

export type ApiCase = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  region: string;
  source: string;
  budget: number;
  market: number;
  currency: "USD" | "GBP";
  days: number;
  story: string;
  href?: string;
};

export async function fetchCases(limit = 12): Promise<ApiCase[]> {
  const data = await apiFetch<{ items: ApiCase[] }>(`/api/v1/cases?limit=${limit}`);
  return data.items;
}

export type ApiPurchasedCar = {
  id: string;
  year: number;
  make: string;
  model: string;
  image: string;
  source: string;
  region: string;
  damage: string;
  odometer: string;
  auctionPrice: number;
  delivery: number;
  dismantle: number;
  deliveryAndFees: number;
  totalCost: number;
  marketBy: number;
  currency: "USD" | "GBP";
  href?: string;
};

export async function fetchPurchased(limit = 12): Promise<ApiPurchasedCar[]> {
  const data = await apiFetch<{ items: ApiPurchasedCar[] }>(`/api/v1/purchased?limit=${limit}`);
  return data.items;
}

/** Manager-curated whole cars (not kits). */
export type ApiPurchasedWholeCar = ApiPurchasedCar & {
  trim?: string;
  purchasedAt?: string;
  note?: string;
  published?: boolean;
};

function resolveApiMedia(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return apiUrl(path);
}

export async function fetchPurchasedCars(limit = 24): Promise<ApiPurchasedWholeCar[]> {
  const data = await apiFetch<{ items: ApiPurchasedWholeCar[] }>(
    `/api/v1/purchased-cars?limit=${limit}`,
  );
  return data.items.map((item) => ({
    ...item,
    image: resolveApiMedia(item.image),
  }));
}

export type LeadPayload = {
  name?: string;
  phone?: string;
  messenger?: string;
  model?: string;
  origin?: string;
  budget?: string;
  timing?: string;
  body?: string;
  condition?: string;
  comment?: string;
  source?: string;
  page?: string;
};

export async function submitLead(payload: LeadPayload): Promise<{ id: string }> {
  return apiFetch("/api/v1/leads", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type QuoteRequestBody = {
  region: "usa" | "uk";
  bid: number;
  location?: string;
  category?: string;
  title?: string;
  body_style?: string;
  vat_on_sale?: boolean;
  dismantle_type?: string;
  dismantle_kg?: number;
  inland_miles?: number;
  volume?: "high" | "standard";
  bid_method?: "live" | "proxy";
  fx_rate?: number;
};

export async function fetchQuote(body: QuoteRequestBody): Promise<{ region: string; quote: unknown }> {
  return apiFetch("/api/v1/pricing/quote", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type LotFromUrlResponse = {
  ok: boolean;
  url: string;
  source: string;
  auction_platform: "copart" | "iaai" | string;
  lotNumber?: string | null;
  bid?: number | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  title?: string | null;
  location?: string | null;
  odometer?: number | null;
  images?: string[];
  via?: string;
  cdp?: string;
};

export async function fetchLotFromUrl(url: string): Promise<LotFromUrlResponse> {
  return apiFetch("/api/v1/pricing/lot-from-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function fetchHealth(): Promise<{ status: string; lots: number }> {
  return apiFetch("/health");
}
