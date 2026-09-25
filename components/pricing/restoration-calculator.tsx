"use client";

import { useCallback, useMemo, useState } from "react";
import { CustomsByPanel } from "@/components/pricing/customs-by-panel";
import type { CustomsByResult } from "@/lib/pricing/customs-by";
import {
  estimateIaaiAuctionFeesUsd,
} from "@/lib/auctions/lot-quote";
import {
  quoteRestoration,
  type RestorationQuote,
} from "@/lib/pricing/restoration-quote";
import { listTitleTariffs } from "@/lib/pricing/usa-title";
import { listYards, type VehicleSize } from "@/lib/pricing/usa-delivery";
import { fetchLotFromUrl } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";

function usd(n: number, digits = 0) {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function byn(n: number) {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} BYN`;
}

function matchYard(platform: "iaai" | "copart", location: string | null | undefined): string | null {
  if (!location) return null;
  const yards = listYards(platform);
  const low = location.toLowerCase();
  const exact = yards.find((y) => y.toLowerCase() === low);
  if (exact) return exact;
  const partial = yards.find(
    (y) => y.toLowerCase().includes(low) || low.includes(y.toLowerCase().split(" - ")[0] || ""),
  );
  return partial || null;
}

const TITLE_OPTIONS = listTitleTariffs();
const IAAI_YARDS = listYards("iaai");
const COPART_YARDS = listYards("copart");
const DEFAULT_IAAI = IAAI_YARDS.find((y) => y.startsWith("HOUSTON - ")) || IAAI_YARDS[0] || "";
const DEFAULT_COPART =
  COPART_YARDS.find((y) => y.startsWith("HOUSTON - ")) || COPART_YARDS[0] || "";

export function RestorationCalculator() {
  const [lotUrl, setLotUrl] = useState("");
  const [lotLoading, setLotLoading] = useState(false);
  const [lotError, setLotError] = useState<string | null>(null);
  const [lotMeta, setLotMeta] = useState<string | null>(null);
  const [bidText, setBidText] = useState("8000");
  const [feesOverride, setFeesOverride] = useState("");
  const [platform, setPlatform] = useState<"iaai" | "copart">("iaai");
  const [location, setLocation] = useState(DEFAULT_IAAI);
  const [yardFilter, setYardFilter] = useState("");
  const [size, setSize] = useState<VehicleSize>("regular");
  const [oceanDest, setOceanDest] = useState<"klaipeda" | "poti">("klaipeda");
  const [titleCode, setTitleCode] = useState("Salvage Title / Certif / of distrctn");
  const [isSublot, setIsSublot] = useState(false);
  const [yearText, setYearText] = useState("2018");
  const [inlandOverride, setInlandOverride] = useState("");
  const [oceanOverride, setOceanOverride] = useState("");
  const [customs, setCustoms] = useState<CustomsByResult | null>(null);

  const onCustoms = useCallback((r: CustomsByResult | null) => setCustoms(r), []);

  const loadFromUrl = useCallback(async () => {
    const url = lotUrl.trim();
    if (!url) {
      setLotError("Вставьте ссылку Copart / Bid.cars / IAAI");
      return;
    }
    if (!isApiEnabled()) {
      setLotError("API недоступен");
      return;
    }
    setLotLoading(true);
    setLotError(null);
    setLotMeta(null);
    try {
      const lot = await fetchLotFromUrl(url);
      const auction =
        lot.auction_platform === "copart" || lot.auction_platform === "iaai"
          ? lot.auction_platform
          : lot.source === "copart"
            ? "copart"
            : "iaai";
      setPlatform(auction);
      if (lot.bid != null && Number(lot.bid) > 0) setBidText(String(Math.round(Number(lot.bid))));
      if (lot.year) setYearText(String(lot.year));
      if (lot.title) {
        const match = TITLE_OPTIONS.find(
          (t) =>
            t.code.toLowerCase().includes(String(lot.title).toLowerCase()) ||
            String(lot.title).toLowerCase().includes(t.code.toLowerCase().slice(0, 12)),
        );
        if (match) setTitleCode(match.code);
      }
      const yard = matchYard(auction, lot.location || undefined);
      if (yard) {
        setLocation(yard);
        setYardFilter("");
      }
      const label = [lot.year, lot.make, lot.model, lot.lotNumber && `#${lot.lotNumber}`]
        .filter(Boolean)
        .join(" ");
      setLotMeta(
        `${label || "Лот загружен"} · Chrome CDP (${lot.via || "headless"})`,
      );
    } catch (err) {
      setLotError(err instanceof Error ? err.message : "Не удалось открыть лот");
    } finally {
      setLotLoading(false);
    }
  }, [lotUrl]);

  const bid = Number(bidText) || 0;
  const autoFees = estimateIaaiAuctionFeesUsd(bid);
  const fees = feesOverride !== "" ? Number(feesOverride) || 0 : autoFees;
  const year = Number(yearText) || null;

  const yards = platform === "copart" ? COPART_YARDS : IAAI_YARDS;
  const filteredYards = useMemo(() => {
    const q = yardFilter.trim().toLowerCase();
    if (!q) return yards;
    return yards.filter((y) => y.toLowerCase().includes(q));
  }, [yards, yardFilter]);

  const setPlatformAndYard = (next: "iaai" | "copart") => {
    setPlatform(next);
    setYardFilter("");
    const list = next === "copart" ? COPART_YARDS : IAAI_YARDS;
    const preferred =
      list.find((y) => y.startsWith("HOUSTON - ")) ||
      list.find((y) => y.toLowerCase().includes("houston")) ||
      list[0] ||
      "";
    setLocation(preferred);
  };

  const quote: RestorationQuote | null = useMemo(
    () =>
      quoteRestoration({
        bid,
        auctionFeesUsd: fees,
        location,
        auctionPlatform: platform,
        vehicleSize: size,
        oceanDestination: oceanDest,
        titleCode,
        isSublot,
        inlandUsd: inlandOverride !== "" ? Number(inlandOverride) : null,
        oceanUsd: oceanOverride !== "" ? Number(oceanOverride) : null,
        includeDelivery: true,
      }),
    [bid, fees, location, platform, size, oceanDest, titleCode, isSublot, inlandOverride, oceanOverride],
  );

  const grandWithCustoms =
    quote && customs?.ok && customs.totalUsd != null
      ? Math.round(quote.grandUsd + customs.totalUsd)
      : quote
        ? Math.round(quote.grandUsd)
        : null;

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-text-secondary">
        Просчёт авто: вставьте ссылку Copart / Bid.cars — сервер откроет лот в
        headless Google Chrome (не падает при отключении AnyDesk), подтянет ставку
        и площадку. Дальше: сборы, Title, доставка и растаможка РБ.
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="card-premium space-y-4 rounded-xl p-4 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Просчёт авто
          </p>

          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted sm:col-span-2">
            Ссылка на лот (Copart / Bid.cars / IAAI)
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={lotUrl}
                onChange={(e) => setLotUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void loadFromUrl();
                  }
                }}
                placeholder="https://www.copart.com/lot/… или https://bid.cars/…"
                className="w-full flex-1 rounded-lg border border-border px-3 py-2 text-sm text-text-primary"
              />
              <button
                type="button"
                onClick={() => void loadFromUrl()}
                disabled={lotLoading}
                className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {lotLoading ? "Открываем Chrome…" : "Подтянуть из Chrome"}
              </button>
            </div>
            {lotError ? (
              <p className="mt-1.5 text-xs font-normal normal-case tracking-normal text-red-600">
                {lotError}
              </p>
            ) : null}
            {lotMeta ? (
              <p className="mt-1.5 text-xs font-normal normal-case tracking-normal text-emerald-700">
                {lotMeta}
              </p>
            ) : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Ставка, USD
              <input
                type="number"
                min={0}
                value={bidText}
                onChange={(e) => setBidText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-lg font-semibold text-text-primary"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Аукционный сбор IAAI, USD
              <input
                type="number"
                min={0}
                placeholder={String(autoFees)}
                value={feesOverride}
                onChange={(e) => setFeesOverride(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-lg font-semibold text-text-primary"
              />
              <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-text-muted">
                По умолчанию ${autoFees.toLocaleString("en-US")} по таблице IAAI от ставки
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Площадка
              <select
                value={platform}
                onChange={(e) => setPlatformAndYard(e.target.value as "iaai" | "copart")}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
              >
                <option value="iaai">IAAI</option>
                <option value="copart">Copart</option>
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Размер
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as VehicleSize)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
              >
                <option value="regular">Regular / Large</option>
                <option value="oversize">Oversize</option>
                <option value="moto">Moto</option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Город / площадка (прайс доставки)
              <input
                type="search"
                value={yardFilter}
                onChange={(e) => setYardFilter(e.target.value)}
                placeholder="Поиск: Houston, Dallas…"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
              />
            </label>
            <select
              value={yards.includes(location) ? location : ""}
              onChange={(e) => {
                if (e.target.value) setLocation(e.target.value);
              }}
              size={8}
              className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm text-text-primary"
            >
              {!yards.includes(location) && location ? (
                <option value="" disabled>
                  Не в списке: {location}
                </option>
              ) : null}
              {filteredYards.length === 0 ? (
                <option value="" disabled>
                  Ничего не найдено
                </option>
              ) : (
                filteredYards.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))
              )}
            </select>
            <p className="text-xs text-text-muted">
              Выбрано: <span className="font-medium text-text-secondary">{location || "—"}</span>
              {quote?.delivery?.fromTariff
                ? ` · прайс: inland $${Math.round(quote.delivery.inlandUsd)}`
                : " · прайс не найден"}
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="ocean"
                checked={oceanDest === "klaipeda"}
                onChange={() => setOceanDest("klaipeda")}
              />
              Klaipeda
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="ocean"
                checked={oceanDest === "poti"}
                onChange={() => setOceanDest("poti")}
              />
              Poti
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isSublot} onChange={(e) => setIsSublot(e.target.checked)} />
              Sublot / Offsite (+$100)
            </label>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Title / Sale Doc
            <select
              value={titleCode}
              onChange={(e) => setTitleCode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
            >
              {TITLE_OPTIONS.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} {t.costUsd > 0 ? `($${t.costUsd})` : "(без доплат)"}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Год выпуска (для возраста на таможне)
            <input
              type="number"
              value={yearText}
              onChange={(e) => setYearText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
            />
          </label>

          <details className="rounded-lg border border-border bg-bg-base p-3 text-sm">
            <summary className="cursor-pointer font-medium text-text-secondary">
              Ручной inland / ocean (если площадка не в прайсе)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-text-muted">
                Inland, USD
                <input
                  type="number"
                  value={inlandOverride}
                  onChange={(e) => setInlandOverride(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                  placeholder="из прайса"
                />
              </label>
              <label className="block text-xs text-text-muted">
                Ocean, USD
                <input
                  type="number"
                  value={oceanOverride}
                  onChange={(e) => setOceanOverride(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                  placeholder="из прайса"
                />
              </label>
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <div className="card-premium rounded-xl p-5 sm:p-6">
            {quote ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  Просчёт авто
                </p>
                <p className="mt-1 text-xs text-text-muted">Расходы до Беларуси (без таможни)</p>
                <p className="mt-2 font-display text-3xl font-semibold text-accent-dark">
                  {usd(Math.round(quote.grandUsd))}
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  <Line label="Ставка" value={usd(quote.bid)} />
                  <Line label="Аукционный сбор" value={usd(quote.auctionFeesUsd)} />
                  {quote.delivery ? (
                    <>
                      <Line
                        label="Inland"
                        value={usd(quote.delivery.inlandUsd)}
                        hint={
                          quote.delivery.fromTariff
                            ? quote.delivery.matchedLocation || undefined
                            : "ручной / fallback"
                        }
                      />
                      <Line
                        label={`Море → ${quote.delivery.oceanDestination === "poti" ? "Poti" : "Klaipeda"}`}
                        value={usd(quote.delivery.oceanUsd)}
                        hint={quote.delivery.usPortLabel || undefined}
                      />
                    </>
                  ) : null}
                  {quote.titleDocUsd > 0 ? (
                    <Line label="Title / Sale Doc" value={usd(quote.titleDocUsd)} />
                  ) : (
                    <Line label="Title / Sale Doc" value="без доплат" />
                  )}
                  {quote.isSublot ? <Line label="Sublot / Offsite" value={usd(quote.sublotUsd)} /> : null}
                  <Line label="Диспетчинг" value={usd(quote.dispatchingUsd)} />
                  <Line
                    label={`Комиссия ${(quote.transferFeeRate * 100).toFixed(1)}%`}
                    value={usd(quote.transferFee, 2)}
                  />
                  <Line label="Итого США" value={usd(Math.round(quote.usaWithFees))} total />
                </dl>
                {quote.titleFeeInfo?.unmatched ? (
                  <p className="mt-3 text-xs text-amber-700">
                    Title не сопоставлен с прайсом — доплата 0. Выберите тип из списка.
                  </p>
                ) : null}
                {quote.delivery && !quote.delivery.fromTariff ? (
                  <p className="mt-3 text-xs text-amber-700">
                    Площадка не найдена в прайсе — inland/ocean по fallback. Уточните город или
                    задайте вручную.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-text-muted">Введите ставку</p>
            )}
          </div>

          <div className="card-premium rounded-xl p-5 sm:p-6">
            <CustomsByPanel
              priceUsd={quote?.grandUsd ?? null}
              year={year}
              onResult={onCustoms}
            />
          </div>

          {grandWithCustoms != null ? (
            <div className="rounded-xl border border-accent/30 bg-accent/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-dark">
                Просчёт авто
              </p>
              <p className="mt-1 text-xs text-text-secondary">Итого под ключ с таможней РБ</p>
              <p className="mt-2 font-display text-3xl font-semibold text-accent-dark">
                {usd(grandWithCustoms)}
              </p>
              {customs?.ok ? (
                <p className="mt-2 text-sm text-text-secondary">
                  США {usd(Math.round(quote!.grandUsd))} + таможня ≈{" "}
                  {usd(Math.round(customs.totalUsd || 0))} ({byn(Math.round(customs.totalByn))})
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  hint,
  total,
}: {
  label: string;
  value: string;
  hint?: string;
  total?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${total ? "border-t border-border pt-2 font-semibold" : ""}`}>
      <dt className={total ? "" : "text-text-muted"}>
        {label}
        {hint ? <span className="mt-0.5 block text-[10px] font-normal text-text-muted">{hint}</span> : null}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}
