"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { LotGrid } from "@/components/auctions/lot-grid";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { filterLots, uniqueSorted } from "@/lib/auctions/filter-lots";
import { fetchAllLots } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import type { LotPricingMode } from "@/lib/auctions/lot-quote";
import type { AuctionLot, AuctionRegion, CatalogFilters, CatalogQuickTab } from "@/lib/auctions/types";
import {
  MILEAGE_PRESETS,
  REGION_LABELS,
} from "@/lib/auctions/types";

const PAGE_SIZE = 12;

const YEAR_OPTIONS = Array.from({ length: 2027 - 1990 }, (_, i) => 2026 - i);

const REGION_FILTER_ORDER: AuctionRegion[] = ["usa", "korea", "china", "uk"];

const fieldClass =
  "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent";

type Props = {
  lots: AuctionLot[];
  /** Ограничить каталог регионом (и при обновлении с API) */
  region?: AuctionRegion;
  /** Режим цены на карточках: комплект (с разбором) или авто с доставкой */
  pricingMode?: LotPricingMode;
  /** Предвыбранная марка в фильтрах */
  initialMake?: string;
  /** Предвыбранная модель в фильтрах */
  initialModel?: string;
};

type FilterState = {
  q: string;
  regionFilter: AuctionRegion | "";
  make: string;
  model: string;
  yearFrom: string;
  yearTo: string;
  priceMin: string;
  priceMax: string;
  mileageMax: string;
  fuel: string;
  trans: string;
  drive: string;
  damage: string;
  body: string;
  engMin: string;
  engMax: string;
  run: boolean;
  buynow: boolean;
  tab: CatalogQuickTab;
};

const INITIAL: FilterState = {
  q: "",
  regionFilter: "",
  make: "",
  model: "",
  yearFrom: "",
  yearTo: "",
  priceMin: "",
  priceMax: "",
  mileageMax: "",
  fuel: "",
  trans: "",
  drive: "",
  damage: "",
  body: "",
  engMin: "",
  engMax: "",
  run: false,
  buynow: false,
  tab: "all",
};

function toNum(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function fuelLabel(v: string) {
  const map: Record<string, string> = {
    Gasoline: "Бензин",
    Diesel: "Дизель",
    Hybrid: "Гибрид",
    Electric: "Электро",
    Gas: "Газ",
  };
  return map[v] ?? v;
}

function transLabel(v: string) {
  const map: Record<string, string> = {
    Automatic: "Автомат",
    Manual: "Механика",
    CVT: "CVT",
  };
  return map[v] ?? v;
}

export function AuctionsCatalog({
  lots: initialLots,
  region,
  pricingMode,
  initialMake = "",
  initialModel = "",
}: Props) {
  const [lots, setLots] = useState<AuctionLot[]>(initialLots);
  const [f, setF] = useState<FilterState>(() => ({
    ...INITIAL,
    make: initialMake,
    model: initialModel,
  }));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLots(initialLots);
  }, [initialLots]);

  useEffect(() => {
    setF((prev) => ({
      ...prev,
      make: initialMake || prev.make,
      model: initialModel || prev.model,
    }));
  }, [initialMake, initialModel]);

  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;

    const applyRegion = (items: AuctionLot[]) =>
      region ? items.filter((l) => l.region === region) : items;

    const refresh = () => {
      setApiLoading(true);
      fetchAllLots(100)
        .then((items) => {
          if (cancelled) return;
          // Always apply live API snapshot (even if region filter yields [])
          setLots(applyRegion(items));
        })
        .catch(() => {
          /* keep SSG / props snapshot */
        })
        .finally(() => {
          if (!cancelled) setApiLoading(false);
        });
    };

    refresh();
    const id = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [region]);

  const patch = (partial: Partial<FilterState>) => {
    setF((prev) => ({ ...prev, ...partial }));
  };

  const makes = useMemo(() => uniqueSorted(lots.map((l) => l.make)), [lots]);
  const models = useMemo(() => {
    const pool = f.make ? lots.filter((l) => l.make.toLowerCase() === f.make.toLowerCase()) : lots;
    return uniqueSorted(pool.map((l) => l.model));
  }, [lots, f.make]);

  const regionOptions = useMemo(
    () => REGION_FILTER_ORDER.filter((r) => lots.some((l) => l.region === r)),
    [lots],
  );

  const fuels = useMemo(
    () => uniqueSorted(lots.map((l) => l.fuel)).filter((v) => v && v !== "—"),
    [lots],
  );
  const transmissions = useMemo(
    () => uniqueSorted(lots.map((l) => l.transmission)).filter((v) => v && v !== "—" && v !== "Na"),
    [lots],
  );
  const drives = useMemo(
    () => uniqueSorted(lots.map((l) => l.drive)).filter((v) => v && v !== "—"),
    [lots],
  );
  const damages = useMemo(() => uniqueSorted(lots.map((l) => l.primaryDamage)), [lots]);
  const bodies = useMemo(
    () => uniqueSorted(lots.map((l) => l.bodyStyle)).filter((v) => v && !/LOTFEATURE/i.test(v)),
    [lots],
  );

  const tabOptions = useMemo(() => {
    const tabs: { value: CatalogQuickTab; label: string }[] = [{ value: "all", label: "Все" }];
    if (lots.some((l) => l.runsDrives)) tabs.push({ value: "passable", label: "На ходу" });
    if (lots.some((l) => l.buyNowPrice != null && l.buyNowPrice > 0)) {
      tabs.push({ value: "buy-now", label: "Buy Now" });
    }
    if (lots.some((l) => l.titleType === "clean")) tabs.push({ value: "open", label: "Clean title" });
    return tabs;
  }, [lots]);

  const counts = useMemo(
    () => ({
      usa: lots.filter((l) => l.region === "usa").length,
      uk: lots.filter((l) => l.region === "uk").length,
      korea: lots.filter((l) => l.region === "korea").length,
      china: lots.filter((l) => l.region === "china").length,
    }),
    [lots],
  );

  const catalogFilters: CatalogFilters = useMemo(
    () => ({
      q: f.q.trim() || undefined,
      make: f.make || undefined,
      model: f.model || undefined,
      yearFrom: toNum(f.yearFrom),
      yearTo: toNum(f.yearTo),
      auctions: [],
      region: f.regionFilter || undefined,
      priceMin: toNum(f.priceMin),
      priceMax: toNum(f.priceMax),
      mileageMax: toNum(f.mileageMax),
      fuel: f.fuel || undefined,
      trans: f.trans || undefined,
      drive: f.drive || undefined,
      damage: f.damage || undefined,
      body: f.body || undefined,
      engMin: toNum(f.engMin),
      engMax: toNum(f.engMax),
      run: f.run,
      buynow: f.buynow,
      arch: false,
      tab: f.tab,
    }),
    [f],
  );

  const filtered = useMemo(() => filterLots(lots, catalogFilters), [lots, catalogFilters]);

  const filterKey = JSON.stringify(catalogFilters);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterKey]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => Math.min(n + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered.length, visible.length]);

  const activeCount = useMemo(() => {
    let n = 0;
    (Object.keys(INITIAL) as (keyof FilterState)[]).forEach((key) => {
      if (key === "tab") {
        if (f.tab !== "all") n += 1;
        return;
      }
      if (key === "run" || key === "buynow") {
        if (f[key]) n += 1;
        return;
      }
      if (f[key]) n += 1;
    });
    return n;
  }, [f]);

  const reset = () => {
    setF(INITIAL);
    setVisibleCount(PAGE_SIZE);
  };

  const renderFilterFields = () => (
    <div className="space-y-4">
      {tabOptions.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {tabOptions.map((tab) => {
            const active = f.tab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() =>
                  patch({
                    tab: tab.value,
                    run: tab.value === "passable",
                    buynow: tab.value === "buy-now",
                  })
                }
                className={`min-h-9 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-accent text-white"
                    : "bg-zinc-100 text-text-secondary hover:bg-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <Field label="Поиск">
        <input
          value={f.q}
          onChange={(e) => patch({ q: e.target.value })}
          placeholder="Марка, модель, VIN, лот..."
          className={fieldClass}
        />
      </Field>

      {!region && regionOptions.length > 1 ? (
        <Field label="Регион">
          <select
            value={f.regionFilter}
            onChange={(e) =>
              patch({ regionFilter: e.target.value as AuctionRegion | "" })
            }
            className={fieldClass}
          >
            <option value="">Все</option>
            {regionOptions.map((key) => (
              <option key={key} value={key}>
                {REGION_LABELS[key]}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Марка">
          <select
            value={f.make}
            onChange={(e) => patch({ make: e.target.value, model: "" })}
            className={fieldClass}
          >
            <option value="">Все</option>
            {makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Модель">
          <select
            value={f.model}
            onChange={(e) => patch({ model: e.target.value })}
            className={fieldClass}
          >
            <option value="">Все</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Год от">
          <select
            value={f.yearFrom}
            onChange={(e) => patch({ yearFrom: e.target.value })}
            className={fieldClass}
          >
            <option value="">—</option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Год до">
          <select
            value={f.yearTo}
            onChange={(e) => patch({ yearTo: e.target.value })}
            className={fieldClass}
          >
            <option value="">—</option>
            {YEAR_OPTIONS.map((y) => (
              <option key={`to-${y}`} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ставка от">
          <input
            type="number"
            min={0}
            value={f.priceMin}
            onChange={(e) => patch({ priceMin: e.target.value })}
            placeholder="0"
            className={fieldClass}
          />
        </Field>
        <Field label="Ставка до">
          <input
            type="number"
            min={0}
            value={f.priceMax}
            onChange={(e) => patch({ priceMax: e.target.value })}
            placeholder="∞"
            className={fieldClass}
          />
        </Field>
      </div>

      <Field label="Пробег до">
        <select
          value={f.mileageMax}
          onChange={(e) => patch({ mileageMax: e.target.value })}
          className={fieldClass}
        >
          <option value="">Не важно</option>
          {MILEAGE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {fuels.length > 0 ? (
        <Field label="Тип топлива">
          <select
            value={f.fuel}
            onChange={(e) => patch({ fuel: e.target.value })}
            className={fieldClass}
          >
            <option value="">Все</option>
            {fuels.map((opt) => (
              <option key={opt} value={opt}>
                {fuelLabel(opt)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {transmissions.length > 0 ? (
          <Field label="КПП">
            <select
              value={f.trans}
              onChange={(e) => patch({ trans: e.target.value })}
              className={fieldClass}
            >
              <option value="">Все</option>
              {transmissions.map((opt) => (
                <option key={opt} value={opt}>
                  {transLabel(opt)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {drives.length > 0 ? (
          <Field label="Привод">
            <select
              value={f.drive}
              onChange={(e) => patch({ drive: e.target.value })}
              className={fieldClass}
            >
              <option value="">Все</option>
              {drives.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Объём от, л">
          <input
            type="number"
            min={0}
            step="0.1"
            value={f.engMin}
            onChange={(e) => patch({ engMin: e.target.value })}
            placeholder="1.6"
            className={fieldClass}
          />
        </Field>
        <Field label="Объём до, л">
          <input
            type="number"
            min={0}
            step="0.1"
            value={f.engMax}
            onChange={(e) => patch({ engMax: e.target.value })}
            placeholder="5.0"
            className={fieldClass}
          />
        </Field>
      </div>

      {damages.length > 0 ? (
        <Field label="Повреждение">
          <select
            value={f.damage}
            onChange={(e) => patch({ damage: e.target.value })}
            className={fieldClass}
          >
            <option value="">Все</option>
            {damages.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {bodies.length > 0 ? (
        <Field label="Кузов">
          <select
            value={f.body}
            onChange={(e) => patch({ body: e.target.value })}
            className={fieldClass}
          >
            <option value="">Все</option>
            {bodies.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <button
        type="button"
        onClick={reset}
        className="w-full rounded-lg border border-border py-2.5 text-sm text-text-secondary transition hover:border-accent hover:text-accent-dark"
      >
        Сбросить фильтры
      </button>
    </div>
  );

  return (
    <div className="catalog-layout">
      {/* Desktop sidebar */}
      <aside className="catalog-filters-sticky hidden lg:block">
        <div className="catalog-filters-panel rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm sm:p-5">
          <p className="font-display text-lg font-semibold">Фильтры</p>
          <div className="mt-4">{renderFilterFields()}</div>
        </div>
      </aside>

      <div ref={resultsRef} className="catalog-results min-w-0 flex-1">
        <div className="sticky top-[4.25rem] z-30 -mx-4 mb-5 border-b border-border bg-bg-base/95 px-4 py-3 backdrop-blur lg:static lg:z-auto lg:mx-0 lg:mb-5 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
          <div className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
          {/* Mobile: sheet above header (z-110) — lots stay visible until opened */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-bg-elevated px-3.5 py-2 text-sm font-semibold text-text-primary shadow-sm lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Фильтры
            {activeCount > 0 ? (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-dark">
                {activeCount}
              </span>
            ) : null}
          </button>

          {!region ? (
            <>
              <span className="badge-primary rounded-full px-3 py-1 font-medium">
                США — {counts.usa}
              </span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-text-secondary">
                {REGION_LABELS.korea} — {counts.korea}
              </span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-text-secondary">
                {REGION_LABELS.china} — {counts.china}
              </span>
              <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-text-secondary">
                {REGION_LABELS.uk} — {counts.uk}
              </span>
            </>
          ) : null}
          <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-text-secondary">
            Найдено: {filtered.length}
            {apiLoading ? (
              <span className="ml-2 text-xs font-normal text-text-muted">обновление…</span>
            ) : null}
            {visible.length < filtered.length ? ` · показано ${visible.length}` : null}
          </span>
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:border-accent hover:text-accent-dark"
            >
              Сбросить
            </button>
          ) : null}
          </div>
        </div>

        <LotGrid key={filterKey} lots={visible} pricingMode={pricingMode} />

        {hasMore ? (
          <div ref={sentinelRef} className="flex justify-center py-10" aria-hidden>
            <span className="h-8 w-8 animate-pulse rounded-full border-2 border-accent/40 border-t-accent" />
          </div>
        ) : filtered.length > 0 ? (
          <p className="mt-8 text-center text-sm text-text-muted">Все лоты загружены</p>
        ) : lots.length === 0 ? (
          <div className="card-premium rounded-xl p-12 text-center">
            <p className="font-display text-xl font-semibold">Каталог пока пуст</p>
            <p className="mt-2 text-text-secondary">Лоты появятся после загрузки данных с фото.</p>
          </div>
        ) : null}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[min(90dvh,40rem)] flex-col gap-0 overflow-hidden rounded-t-2xl bg-bg-elevated p-0 lg:hidden"
        >
          <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left">
            <SheetTitle className="font-display text-lg">Фильтры</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {renderFilterFields()}
          </div>
          <SheetFooter className="shrink-0 border-t border-border px-4 py-3 sm:flex-col sm:space-x-0">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-dark"
            >
              Показать {filtered.length}{" "}
              {filtered.length === 1 ? "лот" : filtered.length < 5 ? "лота" : "лотов"}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      {children}
    </div>
  );
}
