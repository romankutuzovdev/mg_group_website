import { cn } from "@/lib/utils";

/** Доп. услуги при растаможке: в расчёт не входят, цена по запросу. */
export const CUSTOMS_EXTRA_SERVICES = [
  "Эвакуатор от таможни до дверей клиента",
  "Полное таможенное сопровождение",
] as const;

export function CustomsExtraServices({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-stone-200 p-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Доп. услуги</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-stone-700">
        {CUSTOMS_EXTRA_SERVICES.map((s) => (
          <li key={s}>*{s}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-stone-500">* В расчёт не входят, стоимость уточняйте у менеджера.</p>
    </div>
  );
}
