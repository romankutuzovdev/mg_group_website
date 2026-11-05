"use client";

import { useState } from "react";
import { Badge, inputClass } from "@/components/cabinet/ui";
import { CAR_STATUS_LABELS, adminUpdateDeal, type CarStatus, type Deal } from "@/lib/api/cabinet";

const STATUSES = Object.entries(CAR_STATUS_LABELS) as [Exclude<CarStatus, "">, string][];

export function DealCarStatusBadge({ deal }: { deal: Deal }) {
  if (!deal.car_status) return null;
  return (
    <Badge tone={deal.car_status === "delivered" ? "success" : "info"} className="ml-1">
      {CAR_STATUS_LABELS[deal.car_status]}
    </Badge>
  );
}

/** Где сейчас машина: менеджер выбирает, клиент видит. */
export function DealCarStatus({
  deal,
  isManager = false,
  onUpdated,
}: {
  deal: Deal;
  isManager?: boolean;
  onUpdated?: (deal: Deal) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isManager) {
    return <span>{deal.car_status ? CAR_STATUS_LABELS[deal.car_status] : "Уточняется"}</span>;
  }

  const save = async (next: CarStatus) => {
    setBusy(true);
    setError(null);
    try {
      onUpdated?.(await adminUpdateDeal(deal.id, { car_status: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0">
      <select
        aria-label="Где машина"
        className={inputClass}
        value={deal.car_status || ""}
        disabled={busy}
        onChange={(e) => void save(e.target.value as CarStatus)}
      >
        <option value="">Не выбран</option>
        {STATUSES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
