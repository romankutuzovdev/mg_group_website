"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  fetchLotMeta,
  fetchLotsPage,
  type LotMetaResponse,
  type LotQuery,
} from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import {
  consumeCatalogRestore,
  saveCatalogRestore,
} from "@/lib/auctions/catalog-session";
import type { LotPricingMode } from "@/lib/auctions/lot-quote";
import type { AuctionLot, AuctionRegion, CatalogQuickTab } from "@/lib/auctions/types";
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

function filtersToQuery(
  f: FilterState,
  regionProp: AuctionRegion | undefined,
  page: number,
): LotQuery {
  return {
    q: f.q.trim() || undefined,
    make: f.make || undefined,
    model: f.model || undefined,
    yearFrom: toNum(f.yearFrom),
    yearTo: toNum(f.yearTo),
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
    run: f.run || undefined,
    buynow: f.buynow || undefined,
    tab: f.tab !== "all" ? f.tab : undefined,
    region: regionProp || f.regionFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
    sort: "date",
    order: "desc",
  };
}

function filterStateFromRecord(raw: Record<string, string | boolean>): FilterState {
  return {
    ...INITIAL,
    ...Object.fromEntries(
      (Object.keys(INITIAL) as (keyof FilterState)[]).map((key) => {
        const v = raw[key];
        if (v === undefined) return [key, INITIAL[key]];
        return [key, v];
      }),
    ),
  } as FilterState;
}

export function AuctionsCatalog({
  lots: initialLots,
  region,
  pricingMode,
  initialMake = "",
  initialModel = "",
}: Props) {
  const apiOn = isApiEnabled();
  const [f, setF] = useState<FilterState>(() => ({
    ...INITIAL,
    make: initialMake,
    model: initialModel,
  }));
  const [lots, setLots] = useState<AuctionLot[]>(() =>
    apiOn ? initialLots.slice(0, PAGE_SIZE) : initialLots,
  );
  const [total, setTotal] = useState(() =>
    apiOn ? Math.max(initialLots.length, 0) : initialLots.length,
  );
  const [catalogTotal, setCatalogTotal] = useState(() =>
    apiOn ? 0 : initialLots.length,
  );
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [meta, setMeta] = useState<LotMetaResponse | null>(null);
  const [restored, setRestored] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const skipNextFilterFetch = useRef(false);
  const focusSlugRef = useRef<string | undefined>(undefined);

  const [debouncedQ, setDebouncedQ] = useState(f.q);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(f.q), 300);
    return () => window.clearTimeout(id);
  }, [f.q]);

  const queryFilters = useMemo(() => ({ ...f, q: debouncedQ }), [f, debouncedQ]);
  const filterKey = JSON.stringify({ ...queryFilters, region: region || "" });

  // Offline / SSG-only path: filter full snapshot client-side
  const offlineFiltered = useMemo(() => {
    if (apiOn) return lots;
    return filterLots(initialLots, {
      q: f.q.trim() || undefined,
      make: f.make || undefined,
      model: f.model || undefined,
      yearFrom: toNum(f.yearFrom),
      yearTo: toNum(f.yearTo),
      auctions: [],
      region: f.regionFilter || region || undefined,
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
    });
  }, [apiOn, initialLots, lots, f, region]);

  const [offlineVisible, setOfflineVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!apiOn) setOfflineVisible(PAGE_SIZE);
  }, [filterKey, apiOn]);

  const visibleLots = apiOn ? lots : offlineFiltered.slice(0, offlineVisible);
  const hasMore = apiOn ? page < pages : offlineVisible < offlineFiltered.length;
  const foundCount = apiOn ? total : offlineFiltered.length;
  const allCount = apiOn
    ? catalogTotal || meta?.total || foundCount
    : initialLots.length;

  const counts = useMemo(() => {
    if (meta?.counts_by_region) {
      return {
        usa: meta.counts_by_region.usa ?? 0,
        uk: meta.counts_by_region.uk ?? 0,
        korea: meta.counts_by_region.korea ?? 0,
        china: meta.counts_by_region.china ?? 0,
      };
    }
    const pool = apiOn ? lots : initialLots;
    return {
      usa: pool.filter((l) => l.region === "usa").length,
      uk: pool.filter((l) => l.region === "uk").length,
      korea: pool.filter((l) => l.region === "korea").length,
      china: pool.filter((l) => l.region === "china").length,
    };
  }, [meta, apiOn, lots, initialLots]);

  const makes = useMemo(() => {
    if (meta?.makes?.length) return meta.makes;
    const pool = apiOn ? lots : initialLots;
    return uniqueSorted(pool.map((l) => l.make));
  }, [meta, apiOn, lots, initialLots]);

  const models = useMemo(() => {
    if (meta?.models?.length) return meta.models;
    const pool = apiOn ? lots : initialLots;
    const scoped = f.make
      ? pool.filter((l) => l.make.toLowerCase() === f.make.toLowerCase())
      : pool;
    return uniqueSorted(scoped.map((l) => l.model));
  }, [meta, apiOn, lots, initialLots, f.make]);

  const regionOptions = useMemo(
    () =>
      REGION_FILTER_ORDER.filter((r) =>
        meta?.regions?.length
          ? meta.regions.includes(r)
          : (apiOn ? lots : initialLots).some((l) => l.region === r),
      ),
    [meta, apiOn, lots, initialLots],
  );

  const fuels = useMemo(() => {
    if (meta?.fuels?.length) return meta.fuels;
    return uniqueSorted((apiOn ? lots : initialLots).map((l) => l.fuel)).filter(
      (v) => v && v !== "—",
    );
  }, [meta, apiOn, lots, initialLots]);

  const transmissions = useMemo(() => {
    if (meta?.transmissions?.length) return meta.transmissions;
    return uniqueSorted((apiOn ? lots : initialLots).map((l) => l.transmission)).filter(
      (v) => v && v !== "—" && v !== "Na",
    );
  }, [meta, apiOn, lots, initialLots]);

  const drives = useMemo(() => {
    if (meta?.drives?.length) return meta.drives;
    return uniqueSorted((apiOn ? lots : initialLots).map((l) => l.drive)).filter(
      (v) => v && v !== "—",
    );
  }, [meta, apiOn, lots, initialLots]);

  const damages = useMemo(() => {
    if (meta?.damages?.length) return meta.damages;
    return uniqueSorted((apiOn ? lots : initialLots).map((l) => l.primaryDamage));
  }, [meta, apiOn, lots, initialLots]);

  const bodies = useMemo(() => {
    if (meta?.body_styles?.length) return meta.body_styles;
    return uniqueSorted((apiOn ? lots : initialLots).map((l) => l.bodyStyle)).filter(
      (v) => v && !/LOTFEATURE/i.test(v),
    );
  }, [meta, apiOn, lots, initialLots]);

  const tabOptions = useMemo(() => {
    const tabs: { value: CatalogQuickTab; label: string }[] = [{ value: "all", label: "Все" }];
    tabs.push({ value: "passable", label: "На ходу" });
    tabs.push({ value: "buy-now", label: "Buy Now" });
    tabs.push({ value: "open", label: "Clean title" });
    return tabs;
  }, []);

  const loadPage = useCallback(
    async (targetPage: number, mode: "replace" | "append", filters: FilterState) => {
      if (!apiOn) return;
      const query = filtersToQuery(filters, region, targetPage);
      if (mode === "replace") setApiLoading(true);
      else setLoadingMore(true);
      try {
        const res = await fetchLotsPage(query);
        setTotal(res.total);
        setPages(res.pages);
        setPage(res.page);
        setLots((prev) => (mode === "append" ? [...prev, ...res.items] : res.items));
      } catch {
        /* keep current snapshot */
      } finally {
        setApiLoading(false);
        setLoadingMore(false);
      }
    },
    [apiOn, region],
  );

  // Restore scroll / filters once on mount
  useEffect(() => {
    if (restored || typeof window === "undefined") return;
    const snap = consumeCatalogRestore(window.location.pathname);
    if (!snap) {
      setRestored(true);
      return;
    }
    const nextFilters = filterStateFromRecord(snap.filters);
    setF(nextFilters);
    focusSlugRef.current = snap.focusSlug;
    skipNextFilterFetch.current = true;
    setRestored(true);

    if (!apiOn) {
      setOfflineVisible(Math.max(PAGE_SIZE, snap.page * PAGE_SIZE));
      requestAnimationFrame(() => {
        window.scrollTo({ top: snap.scrollY, behavior: "auto" });
      });
      return;
    }

    let cancelled = false;
    (async () => {
      const targetPages = Math.max(1, snap.page);
      const merged: AuctionLot[] = [];
      let lastTotal = 0;
      let lastPages = 1;
      for (let p = 1; p <= targetPages; p++) {
        try {
          const res = await fetchLotsPage(filtersToQuery(nextFilters, region, p));
          if (cancelled) return;
          merged.push(...res.items);
          lastTotal = res.total;
          lastPages = res.pages;
          if (p >= res.pages) break;
        } catch {
          break;
        }
      }
      if (cancelled) return;
      setLots(merged);
      setTotal(lastTotal);
      setPages(lastPages);
      setPage(Math.min(targetPages, lastPages));
      requestAnimationFrame(() => {
        window.scrollTo({ top: snap.scrollY, behavior: "auto" });
        if (focusSlugRef.current) {
          const el = document.querySelector(
            `[data-lot-slug="${CSS.escape(focusSlugRef.current)}"]`,
          );
          el?.scrollIntoView({ block: "center" });
        }
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [restored, apiOn, region]);

  // Meta facets
  useEffect(() => {
    if (!apiOn) return;
    let cancelled = false;
    fetchLotMeta({ region, make: f.make || undefined })
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [apiOn, region, f.make]);

  // Fetch page 1 when filters change (API mode)
  useEffect(() => {
    if (!apiOn || !restored) return;
    if (skipNextFilterFetch.current) {
      skipNextFilterFetch.current = false;
      return;
    }
    void loadPage(1, "replace", queryFilters);
  }, [apiOn, restored, filterKey, loadPage, queryFilters]);

  // Infinite scroll
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (apiOn) {
          if (loadingMore || apiLoading) return;
          void loadPage(page + 1, "append", queryFilters);
        } else {
          setOfflineVisible((n) => n + PAGE_SIZE);
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, apiOn, loadingMore, apiLoading, page, queryFilters, loadPage]);

  useEffect(() => {
    setF((prev) => ({
      ...prev,
      make: initialMake || prev.make,
      model: initialModel || prev.model,
    }));
  }, [initialMake, initialModel]);

  const patch = (partial: Partial<FilterState>) => {
    setF((prev) => ({ ...prev, ...partial }));
  };

  // Unfiltered catalog total (region-scoped)
  useEffect(() => {
    if (!apiOn) {
      setCatalogTotal(initialLots.length);
      return;
    }
    let cancelled = false;
    fetchLotMeta({ region })
      .then((m) => {
        if (!cancelled) setCatalogTotal(m.total);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [apiOn, region, initialLots.length]);

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
    setF({ ...INITIAL, make: initialMake, model: initialModel });
    if (!apiOn) setOfflineVisible(PAGE_SIZE);
  };

  const onLotNavigate = useCallback(
    (slug: string) => {
      if (typeof window === "undefined") return;
      saveCatalogRestore({
        path: window.location.pathname,
        scrollY: window.scrollY,
        page: apiOn ? page : Math.ceil(offlineVisible / PAGE_SIZE),
        filters: { ...f },
        focusSlug: slug,
      });
    },
    [apiOn, page, offlineVisible, f],
  );

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
      <aside className="catalog-filters-sticky hidden lg:block">
        <div className="catalog-filters-panel rounded-2xl border border-border bg-bg-elevated p-4 shadow-sm sm:p-5">
          <p className="font-display text-lg font-semibold">Фильтры</p>
          <div className="mt-4">{renderFilterFields()}</div>
        </div>
      </aside>

      <div className="catalog-results min-w-0 flex-1">
        <div className="sticky top-[4.25rem] z-30 -mx-4 mb-5 border-b border-border bg-bg-base/95 px-4 py-3 backdrop-blur lg:static lg:z-auto lg:mx-0 lg:mb-5 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
          <div className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
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
              Всего: {allCount.toLocaleString("ru-RU")}
              {activeCount > 0 ? (
                <>
                  {" "}
                  · найдено: {foundCount.toLocaleString("ru-RU")}
                </>
              ) : null}
              {apiLoading ? (
                <span className="ml-2 text-xs font-normal text-text-muted">загрузка…</span>
              ) : null}
              {visibleLots.length > 0 && visibleLots.length < foundCount
                ? ` · на экране ${visibleLots.length}`
                : null}
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

        {foundCount === 0 && !apiLoading ? (
          <div className="card-premium rounded-xl p-12 text-center">
            <p className="font-display text-xl font-semibold">Лоты не найдены</p>
            <p className="mt-2 text-text-secondary">
              Попробуйте изменить фильтры или сбросить их.
            </p>
          </div>
        ) : (
          <>
            <LotGrid
              key={filterKey}
              lots={visibleLots}
              pricingMode={pricingMode}
              onLotNavigate={onLotNavigate}
            />

            {hasMore ? (
              <div ref={sentinelRef} className="flex justify-center py-10" aria-hidden>
                <span className="h-8 w-8 animate-pulse rounded-full border-2 border-accent/40 border-t-accent" />
              </div>
            ) : foundCount > 0 ? (
              <p className="mt-8 text-center text-sm text-text-muted">Все лоты загружены</p>
            ) : null}
          </>
        )}
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
              Показать {foundCount}{" "}
              {foundCount === 1 ? "лот" : foundCount < 5 ? "лота" : "лотов"}
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
