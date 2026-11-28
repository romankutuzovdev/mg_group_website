"use client";

import { useEffect, useState } from "react";
import { adminUpdateDeal, type Deal } from "@/lib/api/cabinet";
import { formatPurchaseDate } from "@/lib/cabinet/deal-list";
import { Button, inputClass, labelClass } from "@/components/cabinet/ui";

export function DealPurchaseDate({ deal, canEdit = false, onUpdated }: { deal: Deal; canEdit?: boolean; onUpdated?: (deal: Deal) => void }) {
  const [draft, setDraft] = useState(deal.purchase_date || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(deal.purchase_date || ""); setError(null); }, [deal.id, deal.purchase_date]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onUpdated?.(await adminUpdateDeal(deal.id, { purchase_date: draft || null }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить дату покупки");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-w-0">
      {canEdit ? (
        <>
          <label className={labelClass}>
            Дата покупки
            <input type="date" value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <Button className="mt-2" size="sm" disabled={busy || draft === (deal.purchase_date || "")} onClick={() => void save()}>{busy ? "Сохраняем…" : "Сохранить дату"}</Button>
        </>
      ) : <p className="text-sm text-zinc-600">Дата покупки: <span className="font-medium text-zinc-900">{formatPurchaseDate(deal.purchase_date)}</span></p>}
      {error ? <p role="alert" className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
