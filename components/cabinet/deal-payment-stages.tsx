import type { Deal } from "@/lib/api/cabinet";
import { formatPurchaseDate, paymentStagesForDeal } from "@/lib/cabinet/deal-list";

export function DealPaymentStages({ deal }: { deal: Deal }) {
  return (
    <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" aria-label="Этапы оплаты">
      {paymentStagesForDeal(deal).map((stage) => (
        <span key={stage.stage} className={`rounded-md px-2 py-1 ring-1 ring-inset ${stage.status === "paid" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : stage.status === "overdue" ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-zinc-50 text-zinc-600 ring-zinc-200"}`}>
          Оплата {stage.stage}: {stage.status === "paid" ? "оплачено" : stage.status === "overdue" ? "просрочено" : "ожидается"}
          {stage.date ? ` · ${stage.status === "pending" ? "до " : ""}${formatPurchaseDate(stage.date)}` : ""}
        </span>
      ))}
    </span>
  );
}
