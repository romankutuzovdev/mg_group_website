import type { CarStatus, Deal } from "@/lib/api/cabinet";

export type DealSort = "default" | "status" | "delivery" | "purchase_desc" | "purchase_asc";
export const DEAL_LOCATION_LABELS = {
  selection: "Подбор автомобиля",
  auction: "На аукционе",
  purchased: "Выкуплена",
  yard: "На площадке",
  dismantle: "На разборке",
  port: "В порту",
  ocean: "В море",
  transit: "В пути",
  customs: "На таможне",
  belarus: "В Беларуси",
  delivery: "Выдача клиенту",
  delivered: "Выдана клиенту",
  unknown: "Этап не указан",
} as const;
export type DealLocationKey = keyof typeof DEAL_LOCATION_LABELS;
export type DealStatusFilter = "all" | Deal["status"] | `car:${CarStatus}` | `location:${DealLocationKey}`;
type LocationDeal = Partial<Pick<Deal, "kind" | "origin_point" | "stages" | "car_status">>;
type ListDeal = Pick<Deal, "status"> & LocationDeal & Partial<Pick<Deal, "purchase_date">>;

const STATUS_ORDER = ["active", "completed", "cancelled"];
const LOCATION_ORDER = Object.keys(DEAL_LOCATION_LABELS) as DealLocationKey[];

/** The active route stage is the source of location; general deal status is separate. */
export function dealLocation(deal: LocationDeal): { key: DealLocationKey; label: string } {
  const kit = deal.kind === "kit" || (deal.kind !== "car" && deal.origin_point !== "port");
  const allowed = kit ? ["auction", "origin", "belarus"] : ["selection", "auction", "origin", "ocean", "belarus", "delivery"];
  const stages = (deal.stages || []).filter((stage) => allowed.includes(stage.key));
  const active = stages.find((stage) => stage.status === "active");
  let key: DealLocationKey = "unknown";
  if (active) {
    switch (active.key) {
      case "selection": key = "selection"; break;
      case "auction": key = "auction"; break;
      case "origin": key = kit ? "dismantle" : "port"; break;
      case "ocean": key = "ocean"; break;
      case "belarus":
        if (kit) return { key: "transit", label: "В пути в Беларусь" };
        key = "belarus";
        break;
      case "delivery": key = "delivery"; break;
    }
  } else if (stages.some((stage) => stage.key === (kit ? "belarus" : "delivery") && stage.status === "done")) {
    key = kit ? "belarus" : "delivered";
  } else if (deal.car_status) {
    const manual: Record<Exclude<CarStatus, "">, DealLocationKey> = {
      purchased: "purchased", at_yard: "yard", in_transit: "transit", at_port: "port",
      customs: "customs", arrived: "belarus", delivered: "delivered",
    };
    key = manual[deal.car_status] || "unknown";
  }
  return { key, label: DEAL_LOCATION_LABELS[key] };
}

function compareDeals(a: ListDeal, b: ListDeal, sort: DealSort): number {
  if (sort === "status") return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (sort === "delivery") return LOCATION_ORDER.indexOf(dealLocation(a).key) - LOCATION_ORDER.indexOf(dealLocation(b).key);
  if (sort === "purchase_desc" || sort === "purchase_asc") {
    if (!a.purchase_date) return b.purchase_date ? 1 : 0;
    if (!b.purchase_date) return -1;
    const order = a.purchase_date.localeCompare(b.purchase_date);
    return sort === "purchase_asc" ? order : -order;
  }
  return 0;
}

/** Keep client groups, sorting their cars and then groups by the first car. */
export function prepareDealGroups<T extends { deals: ListDeal[] }>(groups: T[], filter: DealStatusFilter, sort: DealSort): T[] {
  const result = groups.map((group) => ({
    ...group,
    deals: group.deals.filter((deal) => filter === "all" || (filter.startsWith("location:")
      ? dealLocation(deal).key === filter.slice(9)
      : filter.startsWith("car:") ? (deal.car_status || "") === filter.slice(4) : deal.status === filter))
      .sort((a, b) => compareDeals(a, b, sort)),
  })).filter((group) => filter === "all" || group.deals.length);
  if (sort !== "default") result.sort((a, b) => {
    if (!a.deals.length) return b.deals.length ? 1 : 0;
    if (!b.deals.length) return -1;
    return compareDeals(a.deals[0], b.deals[0], sort);
  });
  return result;
}

export function formatPurchaseDate(value?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "Не указана";
}

function minskDay(value: Date): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

export function paymentStagesForDeal(deal: Partial<Deal>, today = minskDay(new Date())) {
  return ([
    { stage: 1, paid: deal.payment_stage1_paid, at: deal.payment_stage1_at, due: deal.payment_stage1_due },
    { stage: 2, paid: deal.payment_stage2_paid, at: deal.payment_stage2_at, due: deal.payment_stage2_due },
  ] as const).map((row) => {
    const date = row.paid ? row.at : row.due;
    const timestamp = date && !/^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date) : null;
    return {
      stage: row.stage,
      status: row.paid ? "paid" as const : row.due && row.due < today ? "overdue" as const : "pending" as const,
      date: timestamp ? Number.isNaN(timestamp.getTime()) ? null : minskDay(timestamp) : date || null,
    };
  });
}
