import { DEAL_LOCATION_LABELS, type DealSort, type DealStatusFilter } from "@/lib/cabinet/deal-list";
import { inputClass, labelClass } from "@/components/cabinet/ui";

export function DealListControls({ status, sort, onStatusChange, onSortChange }: {
  status: DealStatusFilter;
  sort: DealSort;
  onStatusChange: (status: DealStatusFilter) => void;
  onSortChange: (sort: DealSort) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>
        Фильтр автомобилей
        <select className={`${inputClass} mt-1`} value={status} onChange={(event) => onStatusChange(event.target.value as DealStatusFilter)}>
          <option value="all">Все статусы</option>
          <optgroup label="Где находится машина">
            {Object.entries(DEAL_LOCATION_LABELS).map(([value, label]) => <option key={value} value={`location:${value}`}>{label}</option>)}
          </optgroup>
          <optgroup label="Статус сделки">
            <option value="active">В работе</option>
            <option value="completed">Завершена</option>
            <option value="cancelled">Отменена</option>
          </optgroup>
        </select>
      </label>
      <label className={labelClass}>
        Сортировка автомобилей
        <select className={`${inputClass} mt-1`} value={sort} onChange={(event) => onSortChange(event.target.value as DealSort)}>
          <option value="default">Обычный порядок</option>
          <option value="status">По статусу сделки: сначала в работе</option>
          <option value="delivery">По маршруту: от аукциона до выдачи</option>
          <option value="purchase_desc">Дата покупки: сначала новые</option>
          <option value="purchase_asc">Дата покупки: сначала старые</option>
        </select>
      </label>
    </div>
  );
}
