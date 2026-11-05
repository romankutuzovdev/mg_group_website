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
import type { AuctionLot, AuctionRegion, AuctionSource, CatalogQuickTab } from "@/lib/auctions/types";
import {
  MILEAGE_PRESETS,
  REGION_LABELS,
} from "@/lib/auctions/types";

const PAGE_SIZE = 24;

const YEAR_OPTIONS = Array.from({ length: 2027 - 1990 }, (_, i) => 2026 - i);

const REGION_FILTER_ORDER: AuctionRegion[] = ["usa", "korea", "china", "uk"];

const fieldClass =
  "mt-2 block h-11 w-full min-w-0 max-w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 text-sm leading-10 text-stone-900 outline-none transition placeholder:text-stone-400 hover:border-stone-300 focus:border-accent-dark focus:bg-white focus:ring-2 focus:ring-accent/15";

const selectClass =
  `${fieldClass} cursor-pointer appearance-none bg-[length:14px_14px] bg-[right_0.75rem_center] bg-no-repeat pr-9 ` +
  "bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 24 24%22 stroke=%22%2371717a%22%3E%3Cpath stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%222%22 d=%22M19 9l-7 7-7-7%22/%3E%3C/svg%3E')]";

type RegionCountMap = Partial<Record<AuctionRegion, number>>;

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
  /** Оставить только эти площадки (машинокомплект: США и Англия). */
  auctions?: AuctionSource[];
  /** SSR total from /lots — keep showing this if live meta times out */
  initialTotal?: number;
  /** SSR region counters from /lots/meta */
  initialRegionCounts?: RegionCountMap;
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

function lotsWord(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return "лот";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "лота";
  return "лотов";
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
  auctions?: AuctionSource[],
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
    auction: auctions,
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
  auctions,
  initialTotal = 0,
  initialRegionCounts,
}: Props) {
  const apiOn = isApiEnabled();
  const seedLots = useMemo(
    () =>
      auctions?.length
        ? initialLots.filter(
            (lot) =>
              auctions.includes(lot.source) && (lot.region === "usa" || lot.region === "uk"),
          )
        : initialLots,
    [auctions, initialLots],
  );
  const seedTotal = Math.max(initialTotal, seedLots.length, 0);
  const [f, setF] = useState<FilterState>(() => ({
    ...INITIAL,
    make: initialMake,
    model: initialModel,
  }));
  const [lots, setLots] = useState<AuctionLot[]>(() =>
    apiOn ? seedLots.slice(0, PAGE_SIZE) : seedLots,
  );
  const [total, setTotal] = useState(() =>
    apiOn ? seedTotal : initialLots.length,
  );
  const [catalogTotal, setCatalogTotal] = useState(() =>
    apiOn ? seedTotal : initialLots.length,
  );
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Starts true: the first fetch runs in an effect, so an empty seed must not flash «не найдены».
  const [apiLoading, setApiLoading] = useState(apiOn);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [meta, setMeta] = useState<LotMetaResponse | null>(null);
  const [restored, setRestored] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const skipNextFilterFetch = useRef(false);
  const focusSlugRef = useRef<string | undefined>(undefined);
  const loadingMoreRef = useRef(false);
  const apiLoadingRef = useRef(apiOn);
  /** Bumped by every list replace; a response from an older one is dropped. */
  const listRequestRef = useRef(0);
  const restoreStartedRef = useRef(false);
  const pageRef = useRef(1);
  const pagesRef = useRef(1);
  const queryFiltersRef = useRef<FilterState>(f);

  const [debouncedQ, setDebouncedQ] = useState(f.q);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(f.q), 300);
    return () => window.clearTimeout(id);
  }, [f.q]);

  const queryFilters = useMemo(() => ({ ...f, q: debouncedQ }), [f, debouncedQ]);
  const filterKey = JSON.stringify({ ...queryFilters, region: region || "" });

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);
  useEffect(() => {
    apiLoadingRef.current = apiLoading;
  }, [apiLoading]);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => {
    queryFiltersRef.current = queryFilters;
  }, [queryFilters]);

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

  const visibleLots = (apiOn ? lots : offlineFiltered.slice(0, offlineVisible)).filter((lot) =>
    auctions?.length
      ? auctions.includes(lot.source) && (lot.region === "usa" || lot.region === "uk")
      : true,
  );
  const hasMore = apiOn ? page < pages : offlineVisible < offlineFiltered.length;
  const foundCount = apiOn ? total : offlineFiltered.length;
  const allCount = apiOn
    ? catalogTotal || meta?.total || seedTotal || foundCount
    : initialLots.length;

  const counts = useMemo(() => {
    if (meta?.counts_by_region) {
      const encar = meta.counts_by_source?.encar ?? 0;
      const koreaRaw = meta.counts_by_region.korea ?? 0;
      return {
        usa: meta.counts_by_region.usa ?? 0,
        uk: meta.counts_by_region.uk ?? 0,
        // Stale API omit/zero korea while encar source has tens of thousands
        korea: koreaRaw > 0 ? koreaRaw : encar,
        china: meta.counts_by_region.china ?? 0,
      };
    }
    // Never count only the first loaded page — that looked like "Всего: 12".
    if (initialRegionCounts) {
      return {
        usa: initialRegionCounts.usa ?? 0,
        uk: initialRegionCounts.uk ?? 0,
        korea: initialRegionCounts.korea ?? 0,
        china: initialRegionCounts.china ?? 0,
      };
    }
    const pool = apiOn ? lots : initialLots;
    return {
      usa: pool.filter((l) => l.region === "usa").length,
      uk: pool.filter((l) => l.region === "uk").length,
      korea: pool.filter((l) => l.region === "korea").length,
      china: pool.filter((l) => l.region === "china").length,
    };
  }, [meta, apiOn, lots, initialLots, initialRegionCounts]);

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

  const regionOptions = useMemo(() => {
    // Kit catalog: always show USA + England chips (even if UK count is 0)
    if (auctions?.length) {
      return REGION_FILTER_ORDER.filter((r) => r === "usa" || r === "uk");
    }
    return REGION_FILTER_ORDER.filter((r) =>
      meta?.regions?.length
        ? meta.regions.includes(r)
        : (apiOn ? lots : initialLots).some((l) => l.region === r),
    );
  }, [auctions, meta, apiOn, lots, initialLots]);

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
    const raw = meta?.damages?.length
      ? meta.damages
      : uniqueSorted((apiOn ? lots : initialLots).map((l) => l.primaryDamage));
    return raw.filter((d) => d && d.length < 48 && !/stock\s*#:|view all images/i.test(d));
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
      if (mode === "append") {
        if (loadingMoreRef.current || apiLoadingRef.current) return;
        if (targetPage > pagesRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        listRequestRef.current += 1;
        apiLoadingRef.current = true;
        setApiLoading(true);
      }
      const request = listRequestRef.current;
      const isCurrent = () => request === listRequestRef.current;
      const query = filtersToQuery(filters, region, targetPage, auctions);
      try {
        const res = await fetchLotsPage(query);
        if (!isCurrent()) return;
        setLoadFailed(false);
        setTotal(res.total);
        setPages(res.pages);
        pagesRef.current = res.pages;
        setPage(res.page);
        pageRef.current = res.page;
        setLots((prev) => {
          if (mode !== "append") return res.items;
          const seen = new Set(prev.map((l) => l.id));
          const extra = res.items.filter((l) => !seen.has(l.id));
          return extra.length ? [...prev, ...extra] : prev;
        });
      } catch {
        // Keep the current list. A failed "more" still has its button to retry.
        if (mode === "replace" && isCurrent()) setLoadFailed(true);
      } finally {
        if (mode === "append") {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        } else if (isCurrent()) {
          apiLoadingRef.current = false;
          setApiLoading(false);
        }
      }
    },
    [apiOn, region, auctions],
  );

  // Restore scroll / filters once on mount
  useEffect(() => {
    if (restoreStartedRef.current || typeof window === "undefined") return;
    restoreStartedRef.current = true;
    const snap = consumeCatalogRestore(window.location.pathname);
    if (!snap) {
      setRestored(true);
      return;
    }
    const nextFilters = filterStateFromRecord(snap.filters);
    setF(nextFilters);
    setDebouncedQ(nextFilters.q);
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

    listRequestRef.current += 1;
    const request = listRequestRef.current;
    apiLoadingRef.current = true;
    setApiLoading(true);
    (async () => {
      const targetPages = Math.max(1, snap.page);
      const merged: AuctionLot[] = [];
      let lastTotal = 0;
      let lastPages = 1;
      let loadedPage = 0;
      for (let p = 1; p <= targetPages; p++) {
        try {
          const res = await fetchLotsPage(filtersToQuery(nextFilters, region, p, auctions));
          if (request !== listRequestRef.current) return;
          merged.push(...res.items);
          lastTotal = res.total;
          lastPages = res.pages;
          loadedPage = p;
          if (p >= res.pages) break;
        } catch {
          break;
        }
      }
      if (request !== listRequestRef.current) return;
      apiLoadingRef.current = false;
      setApiLoading(false);
      if (loadedPage === 0) {
        // Nothing came back: never wipe the list, go through the normal failure path.
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      setLots(merged);
      setTotal(lastTotal);
      setPages(lastPages);
      pagesRef.current = lastPages;
      setPage(loadedPage);
      pageRef.current = loadedPage;
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
  }, [apiOn, region, auctions]);

  const retryLoad = useCallback(() => {
    if (apiLoadingRef.current) return;
    void loadPage(1, "replace", queryFiltersRef.current);
  }, [loadPage]);

  // While the list is broken keep trying on our own, so nobody has to reload the page.
  useEffect(() => {
    if (!loadFailed) return;
    const id = window.setInterval(() => {
      if (!document.hidden) retryLoad();
    }, 15_000);
    window.addEventListener("online", retryLoad);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", retryLoad);
    };
  }, [loadFailed, retryLoad]);

  // One meta request: filter facets and the unfiltered region total.
  useEffect(() => {
    if (!apiOn) {
      setCatalogTotal(initialLots.length);
      return;
    }
    let cancelled = false;
    fetchLotMeta({ region, make: f.make || undefined })
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        setCatalogTotal(m.total);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [apiOn, region, f.make, initialLots.length, loadFailed]);

  // Fetch page 1 when filters change (API mode)
  useEffect(() => {
    if (!apiOn || !restored) return;
    if (skipNextFilterFetch.current) {
      skipNextFilterFetch.current = false;
      return;
    }
    void loadPage(1, "replace", queryFilters);
  }, [apiOn, restored, filterKey, loadPage, queryFilters]);

  // Infinite scroll — re-bind after each page so IO re-checks intersection.
  // (IO does not re-fire while the sentinel stays continuously visible.)
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    let cancelled = false;

    const tryLoadMore = () => {
      if (cancelled) return;
      if (apiOn) {
        if (loadingMoreRef.current || apiLoadingRef.current) return;
        const next = pageRef.current + 1;
        if (next > pagesRef.current) return;
        void loadPage(next, "append", queryFiltersRef.current);
      } else {
        setOfflineVisible((n) => n + PAGE_SIZE);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        tryLoadMore();
      },
      { root: null, rootMargin: "160px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [hasMore, apiOn, loadPage, filterKey, page, lots.length]);

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
    <div className="w-full min-w-0 max-w-full space-y-3.5 sm:space-y-4">
      <button
        type="button"
        onClick={reset}
        className="min-h-11 w-full cursor-pointer rounded-xl border border-stone-300 bg-white py-3 text-sm font-medium text-stone-600 transition hover:border-accent-dark hover:text-accent-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Сбросить фильтры
      </button>
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
                className={`min-h-10 cursor-pointer rounded-full border px-3.5 py-2 text-xs font-medium transition ${
                  active
                    ? "border-accent-dark bg-accent-dark text-white"
                    : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-950"
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
          enterKeyHint="search"
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

      <div className="catalog-filter-pair">
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

      <div className="catalog-filter-pair">
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

      <div className="catalog-filter-pair">
        <Field label="Ставка от">
          <input
            type="number"
            inputMode="numeric"
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
            inputMode="numeric"
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

      {transmissions.length > 0 || drives.length > 0 ? (
        <div className="catalog-filter-pair">
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
      ) : null}

      <div className="catalog-filter-pair">
        <Field label="Объём от, л">
          <input
            type="number"
            inputMode="decimal"
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
            inputMode="decimal"
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
    </div>
  );

  return (
    <div className="catalog-layout">
      <aside className="catalog-filters-sticky hidden lg:block">
        <div className="catalog-filters-panel rounded-2xl border border-stone-200 bg-white p-5 xl:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">Точный поиск</p>
          <div className="mt-2 flex items-end justify-between gap-3 border-b border-stone-200 pb-5">
            <p className="font-display text-2xl font-semibold tracking-tight text-stone-950">Фильтры</p>
            {activeCount > 0 ? (
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-dark">{activeCount}</span>
            ) : null}
          </div>
          <div className="mt-5 min-w-0">{renderFilterFields()}</div>
        </div>
      </aside>

      <div className="catalog-results min-w-0 flex-1">
        <div className="sticky top-[4.25rem] z-30 -mx-4 mb-6 border-y border-stone-200 bg-[#fafaf9]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#fafaf9]/85 lg:static lg:z-auto lg:mx-0 lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:px-0 lg:pb-5 lg:pt-0 lg:backdrop-blur-none">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-950 lg:hidden"
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
              REGION_FILTER_ORDER.map((item) => {
                const active = f.regionFilter === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => patch({ regionFilter: active ? "" : item })}
                    className={`min-h-9 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? "border-accent-dark bg-accent-dark text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-950"}`}
                  >
                    {REGION_LABELS[item]} <span className="ml-1 tabular-nums opacity-65">{counts[item]}</span>
                  </button>
                );
              })
            ) : null}
            <span className="ml-auto rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600">
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
                className="min-h-9 cursor-pointer rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:border-accent hover:text-accent-dark"
              >
                Сбросить
              </button>
            ) : null}
          </div>
        </div>

        {loadFailed && visibleLots.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>Не получилось обновить список. Показываем прошлые результаты.</span>
            <button
              type="button"
              onClick={retryLoad}
              disabled={apiLoading}
              className="min-h-9 cursor-pointer rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium transition hover:border-amber-500 disabled:cursor-wait disabled:opacity-60"
            >
              {apiLoading ? "Загружаем…" : "Повторить"}
            </button>
          </div>
        ) : null}

        {loadFailed && visibleLots.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center">
            <p className="font-display text-xl font-semibold">Не удалось загрузить каталог</p>
            <p className="mt-2 text-text-secondary">
              Связь с сервером прервалась. Пробуем снова автоматически.
            </p>
            <button
              type="button"
              onClick={retryLoad}
              disabled={apiLoading}
              className="mt-5 min-h-11 cursor-pointer rounded-xl border border-stone-300 bg-white px-6 py-2.5 text-sm font-semibold text-stone-950 transition hover:border-accent hover:text-accent-dark disabled:cursor-wait disabled:opacity-60"
            >
              {apiLoading ? "Загружаем…" : "Повторить"}
            </button>
          </div>
        ) : apiLoading && visibleLots.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white p-12 text-center">
            <span className="h-8 w-8 animate-pulse rounded-full border-2 border-accent/40 border-t-accent" />
            <p className="text-text-secondary">Загружаем лоты…</p>
          </div>
        ) : foundCount === 0 && !apiLoading ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center">
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
              <div className="flex flex-col items-center gap-3 py-10">
                <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
                {loadingMore ? (
                  <span className="h-8 w-8 animate-pulse rounded-full border-2 border-accent/40 border-t-accent" />
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void loadPage(page + 1, "append", queryFilters)
                    }
                    className="min-h-11 cursor-pointer rounded-xl border border-stone-300 bg-white px-6 py-2.5 text-sm font-semibold text-stone-950 transition hover:border-accent hover:text-accent-dark"
                  >
                    Показать ещё
                  </button>
                )}
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
          className="flex h-[min(92dvh,44rem)] w-full max-w-none flex-col gap-0 overflow-hidden rounded-t-2xl border-x-0 bg-[#fafaf9] p-0 lg:hidden"
        >
          <SheetHeader className="shrink-0 border-b border-border px-4 py-3.5 pr-12 text-left sm:px-5">
            <SheetTitle className="font-display text-lg">Фильтры</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {renderFilterFields()}
          </div>
          <SheetFooter className="shrink-0 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-col sm:space-x-0 sm:px-5">
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="w-full cursor-pointer rounded-xl bg-accent-dark py-3.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Показать {foundCount.toLocaleString("ru-RU")} {lotsWord(foundCount)}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 max-w-full">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </span>
      {children}
    </label>
  );
}
