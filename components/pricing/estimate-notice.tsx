import { cn } from "@/lib/utils";

/** Плашка «цена ориентировочная» — для всех расчётов по авто. */
export function EstimateNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900",
        className,
      )}
    >
      <span className="font-semibold">Цена ориентировочная.</span> Итоговая сумма зависит от курса,
      финальной ставки, документов и тарифов на дату оплаты — точный расчёт уточняйте у менеджера.
    </p>
  );
}
