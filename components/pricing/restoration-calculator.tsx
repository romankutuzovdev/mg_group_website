"use client";

import { useCallback, useMemo, useState } from "react";
import { EstimateNotice } from "@/components/pricing/estimate-notice";
import { CustomsByPanel } from "@/components/pricing/customs-by-panel";
import { useRecordQuote } from "@/components/pricing/use-record-quote";
import {
  ShowcasePickButtons,
  showcaseLotCard,
  type ShowcaseLotCard,
} from "@/components/pricing/showcase-pick-buttons";
import type { CustomsByResult } from "@/lib/pricing/customs-by";
import {
  bidcarsFeeProfileFrom,
  estimateBidcarsAuctionFees,
  type BidcarsFeeProfile,
} from "@/lib/pricing/bidcars-fees";
import {
  KLAIPEDA_MINSK_NOTE,
  POTI_MINSK_RATES,
  defaultPotiVehicle,
  quoteRestoration,
  type PotiVehicle,
  type RestorationQuote,
} from "@/lib/pricing/restoration-quote";
import {
  EXTRA_SERVICES,
  INSURANCE_NOTE,
  extrasTotalUsd,
  insuranceUsd,
  type ExtraSelection,
} from "@/lib/pricing/restoration-extras";
import { listTitleTariffs, lookupTitleFee } from "@/lib/pricing/usa-title";
import {
  findYard,
  listYards,
  lookupUsaDelivery,
  oceanUsd as oceanRateUsd,
  type VehicleSize,
} from "@/lib/pricing/usa-delivery";
import { ContainerLoadPicker, type ContainerLoad } from "@/components/pricing/container-load-picker";
import { fetchLotFromUrl } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import { LotLoadButton, LotLoadStatus, lotLoadErrorMessage } from "@/components/pricing/lot-url-load";
import { lotHost, restorationLotUrlError } from "@/lib/pricing/lot-url";

function usd(n: number, digits = 0) {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** Год лота: из поля API, иначе из названия или ссылки (…-2018-toyota-camry-…). */
function lotYear(lot: { year?: number | null; title?: string | null; url?: string | null }, url: string): number | null {
  const max = new Date().getFullYear() + 1;
  const ok = (n: number) => Number.isFinite(n) && n >= 1950 && n <= max;
  const direct = Number(lot.year);
  if (ok(direct)) return direct;
  for (const text of [lot.title, lot.url, url]) {
    const m = String(text || "").match(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/);
    if (m && ok(Number(m[1]))) return Number(m[1]);
  }
  return null;
}

function byn(n: number) {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} BYN`;
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
  const [lotCard, setLotCard] = useState<ShowcaseLotCard | null>(null);
  const [bidText, setBidText] = useState("8000");
  const [platform, setPlatform] = useState<"iaai" | "copart">("iaai");
  const [location, setLocation] = useState(DEFAULT_IAAI);
  const [yardFilter, setYardFilter] = useState("");
  const [size, setSize] = useState<VehicleSize>("regular");
  const [oceanDest, setOceanDest] = useState<"klaipeda" | "poti">("klaipeda");
  const [potiVehicle, setPotiVehicle] = useState<PotiVehicle | null>(null);
  const [titleCode, setTitleCode] = useState("Salvage Title / Certif / of distrctn");
  /** Документ лота как он указан на аукционе (Sale Document). */
  const [lotSaleDoc, setLotSaleDoc] = useState<string | null>(null);
  /** Документ лота не нашёлся в прайсе доплат. */
  const [lotSaleDocUnmatched, setLotSaleDocUnmatched] = useState(false);
  const [isSublot, setIsSublot] = useState(false);
  const [yearText, setYearText] = useState("2018");
  /** Год подставлен из лота (а не дефолт / ручной ввод). */
  const [yearFromLot, setYearFromLot] = useState(false);
  const [lotEngine, setLotEngine] = useState<string | null>(null);
  const [lotFuel, setLotFuel] = useState<string | null>(null);
  /** Ключ загруженного лота — по нему растаможка заново берёт объём. */
  const [lotKey, setLotKey] = useState<string | null>(null);
  const [inlandOverride, setInlandOverride] = useState("");
  const [oceanOverride, setOceanOverride] = useState("");
  const [customs, setCustoms] = useState<CustomsByResult | null>(null);
  const [extras, setExtras] = useState<ExtraSelection>({});
  const [withInsurance, setWithInsurance] = useState(false);
  /** Сколько машин в контейнере: 4 (стандарт) или 3 (тройка, море дороже). */
  const [containerLoad, setContainerLoad] = useState<ContainerLoad>(4);
  const [touched, setTouched] = useState(false);
  /** Профиль сборов со страницы Bid.cars (грузовой / Rec Rides / Crashed Toys). */
  const [feeProfile, setFeeProfile] = useState<BidcarsFeeProfile | null>(null);
  /** Сбор, прочитанный прямо со страницы Bid.cars при загруженной ставке. */
  const [liveFee, setLiveFee] = useState<{
    bid: number;
    auction: "iaai" | "copart";
    total: number;
    lines: { label: string; amount: number }[];
  } | null>(null);

  const onCustoms = useCallback((r: CustomsByResult | null) => setCustoms(r), []);

  const loadFromUrl = useCallback(async () => {
    const url = lotUrl.trim();
    const rejected = restorationLotUrlError(url);
    if (rejected) {
      setLotError(rejected);
      return;
    }
    if (!isApiEnabled()) {
      setLotError("API недоступен");
      return;
    }
    setLotLoading(true);
    setLotError(null);
    setLotMeta(null);
    setLotCard(null);
    try {
      const lot = await fetchLotFromUrl(url);
      const lotIsUk =
        lot.region === "uk" ||
        lot.source === "copart_uk" ||
        lotHost(lot.url || "") === "copart_uk";
      if (lotIsUk) {
        setLotError("Авто под восстановление считается только по США. Вставьте ссылку Bid.cars на лот Copart или IAAI из США");
        return;
      }
      const auction: "iaai" | "copart" =
        lot.bidcarsFees?.auctionType === "copart" ||
        lot.bidcarsFees?.auctionType === "iaai"
          ? lot.bidcarsFees.auctionType
          : lot.auction_platform === "copart" || lot.source === "copart"
            ? "copart"
            : "iaai";
      setFeeProfile(bidcarsFeeProfileFrom(lot.bidcarsFees, auction));
      const loadedBid = lot.bid != null && Number(lot.bid) > 0 ? Math.round(Number(lot.bid)) : null;
      const liveFees = lot.auctionFeesUsd ?? lot.bidcarsFees?.feesUsd;
      setLiveFee(
        loadedBid != null &&
          lot.bidcarsFees?.live &&
          liveFees != null &&
          lot.bidcarsFees.atBid != null &&
          Math.abs(Number(lot.bidcarsFees.atBid) - loadedBid) < 1
          ? {
              bid: loadedBid,
              auction,
              total: Math.round(Number(liveFees)),
              lines: lot.bidcarsFees?.lines ?? [],
            }
          : null,
      );
      if (loadedBid != null) setBidText(String(loadedBid));
      const y = lotYear(lot, url);
      if (y) setYearText(String(y));
      setYearFromLot(y != null);
      setLotEngine(lot.engine ? String(lot.engine) : null);
      setLotFuel(lot.fuel ? String(lot.fuel) : null);
      setLotKey(`${lot.lotNumber || url}:${Date.now()}`);
      const saleDoc = String(lot.saleDocument || "").trim();
      setLotSaleDoc(saleDoc || null);
      setLotSaleDocUnmatched(false);
      if (saleDoc) {
        const info = lookupTitleFee(saleDoc);
        const option =
          info?.matchedRule &&
          TITLE_OPTIONS.find((t) => t.name.toLowerCase() === info.matchedRule!.toLowerCase());
        if (option) setTitleCode(option.name);
        else setLotSaleDocUnmatched(true);
      }
      const yard = findYard(lot.location, auction);
      const matchedPlatform: "iaai" | "copart" =
        yard?.matched_auction === "copart" || yard?.matched_auction === "iaai"
          ? yard.matched_auction
          : auction;
      setPlatform(matchedPlatform);
      if (yard?.location) {
        setLocation(yard.location);
        setYardFilter("");
      } else if (lot.location) {
        setYardFilter(lot.location);
      }
      const label = [y, lot.make, lot.model, lot.lotNumber && `#${lot.lotNumber}`]
        .filter(Boolean)
        .join(" ");
      const place = yard?.location || lot.location;
      setLotCard({
        ...showcaseLotCard(lot, matchedPlatform === "copart" ? "Copart" : "IAAI"),
        year: y ?? lot.year ?? null,
      });
      setLotMeta(
        [label || "Лот загружен", place, matchedPlatform === "copart" ? "Copart" : "IAAI"]
          .filter(Boolean)
          .join(" · "),
      );
      setTouched(true);
    } catch (err) {
      setLotError(lotLoadErrorMessage(err));
    } finally {
      setLotLoading(false);
    }
  }, [lotUrl]);

  const bid = Number(bidText) || 0;
  const feeCalc = useMemo(
    () => estimateBidcarsAuctionFees(bid, { ...(feeProfile ?? {}), auction: platform }),
    [bid, feeProfile, platform],
  );
  const feeFromPage = liveFee != null && liveFee.bid === bid && liveFee.auction === platform;
  const fees = feeFromPage ? liveFee.total : feeCalc.total;
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

  /** Тройка: море по тарифу «OVERSIZE (3-ка)» из прайса для того же порта. */
  const triple = useMemo(() => {
    if (size === "moto") return null;
    const t = lookupUsaDelivery(location, size, platform, oceanDest);
    if (!t) return null;
    const tripleOcean = oceanRateUsd(t.usPort, "oversize", oceanDest);
    if (tripleOcean == null) return null;
    return { ocean: tripleOcean, surcharge: Math.max(0, Math.round(tripleOcean - t.oceanUsd)) };
  }, [location, size, platform, oceanDest]);
  const containerLocked = size === "oversize";
  const effectiveLoad: ContainerLoad = containerLocked ? 3 : containerLoad;
  const tripleOceanUsd =
    effectiveLoad === 3 && !containerLocked && triple ? triple.ocean : null;

  const quote: RestorationQuote | null = useMemo(
    () =>
      quoteRestoration({
        bid,
        auctionFeesUsd: fees,
        location,
        auctionPlatform: platform,
        vehicleSize: size,
        oceanDestination: oceanDest,
        potiVehicle,
        titleCode,
        isSublot,
        inlandUsd: inlandOverride !== "" ? Number(inlandOverride) : null,
        oceanUsd: oceanOverride !== "" ? Number(oceanOverride) : tripleOceanUsd,
        includeDelivery: true,
      }),
    [bid, fees, location, platform, size, oceanDest, potiVehicle, titleCode, isSublot, inlandOverride, oceanOverride, tripleOceanUsd],
  );

  const extrasUsd = extrasTotalUsd(extras);
  const insurance = withInsurance ? insuranceUsd(bid + fees) : null;
  const addonsUsd = extrasUsd + (insurance?.usd ?? 0);
  const selectedExtras = EXTRA_SERVICES.filter((s) => (extras[s.id] || 0) > 0);

  const pricedQuote = quote?.delivery ? quote : null;
  /** Итог без таможни с доп. услугами и страховкой. */
  const grandUsd = quote ? quote.grandUsd + addonsUsd : 0;
  const grandWithCustoms =
    pricedQuote && customs?.ok && customs.totalUsd != null
      ? Math.round(grandUsd + customs.totalUsd)
      : pricedQuote
        ? Math.round(grandUsd)
        : null;

  const setExtraQty = (id: string, qty: number) =>
    setExtras((prev) => ({ ...prev, [id]: Math.max(0, Math.min(99, Math.floor(qty) || 0)) }));

  useRecordQuote(
    touched && pricedQuote && bid > 0
      ? {
          kind: "restoration",
          title: lotMeta || "Авто под восстановление",
          lot_url: lotUrl.trim(),
          location,
          bid,
          currency: "USD",
          total_usd: grandWithCustoms,
          summary: `Восстановление · ${platform === "copart" ? "Copart" : "IAAI"} · ${oceanDest === "poti" ? "Poti" : "Klaipeda"}`,
        }
      : null,
  );

  return (
    <div className="space-y-8" onChange={() => setTouched(true)}>
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="card-premium space-y-4 rounded-xl p-4 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Просчёт авто
          </p>

          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted sm:col-span-2">
            Ссылка на лот (Bid.cars)
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
                placeholder="https://bid.cars/en/lot/…"
                className="w-full flex-1 rounded-lg border border-border px-3 py-2 text-sm text-text-primary"
              />
              <LotLoadButton loading={lotLoading} onClick={() => void loadFromUrl()} />
            </div>
            <LotLoadStatus active={lotLoading} />
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
                ? ` · прайс: доставка по США $${Math.round(quote.delivery.inlandUsd)}`
                : quote?.delivery
                  ? ` · вручную: доставка по США $${Math.round(quote.delivery.inlandUsd)}`
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

          {size !== "moto" ? (
            <ContainerLoadPicker
              value={effectiveLoad}
              onChange={setContainerLoad}
              surchargeUsd={triple?.surcharge ?? null}
              locked={containerLocked}
            />
          ) : null}

          {oceanDest === "poti" ? (
            <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Тип для доставки Поти → Минск
              <select
                value={potiVehicle ?? defaultPotiVehicle(size)}
                onChange={(e) => setPotiVehicle(e.target.value as PotiVehicle)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
              >
                {POTI_MINSK_RATES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} (${r.usd.toLocaleString("en-US")})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Title / Sale Doc
            {lotSaleDoc ? (
              <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-text-secondary">
                Документ лота на аукционе: <span className="font-semibold">{lotSaleDoc}</span>
              </span>
            ) : null}
            <select
              value={titleCode}
              onChange={(e) => {
                setTitleCode(e.target.value);
                setLotSaleDocUnmatched(false);
              }}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
            >
              {TITLE_OPTIONS.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} {t.costUsd > 0 ? `($${t.costUsd})` : "(без доплат)"}
                </option>
              ))}
            </select>
          </label>

          <DocumentWarning
            costUsd={quote?.titleDocUsd ?? 0}
            docName={titleCode}
            lotSaleDoc={lotSaleDoc}
            unmatched={lotSaleDocUnmatched}
          />

          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Год выпуска (для возраста на таможне)
            {yearFromLot ? (
              <span className="ml-2 font-normal normal-case tracking-normal text-emerald-700">из лота</span>
            ) : null}
            <input
              type="number"
              value={yearText}
              onChange={(e) => {
                setYearText(e.target.value);
                setYearFromLot(false);
              }}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
            />
          </label>

          <details className="rounded-lg border border-border bg-bg-base p-3 text-sm">
            <summary className="cursor-pointer font-medium text-text-secondary">
              Ручная доставка по США и море (если площадка не в прайсе)
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-text-muted">
                Доставка по США, USD
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

          <details className="rounded-lg border border-border bg-bg-base p-3 text-sm">
            <summary className="cursor-pointer font-medium text-text-secondary">
              Дополнительный сервис и страхование
              {addonsUsd > 0 ? (
                <span className="ml-2 font-semibold text-primary">+{usd(addonsUsd)}</span>
              ) : null}
            </summary>
            <div className="mt-3 space-y-2">
              {EXTRA_SERVICES.map((s) => {
                const qty = extras[s.id] || 0;
                return (
                  <div key={s.id} className="flex items-start gap-3 rounded-lg border border-border bg-white p-2.5">
                    <input
                      type="checkbox"
                      id={`extra-${s.id}`}
                      checked={qty > 0}
                      onChange={(e) => setExtraQty(s.id, e.target.checked ? 1 : 0)}
                      className="mt-1"
                    />
                    <label htmlFor={`extra-${s.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium text-text-primary">{s.label}</span>
                        <span className="font-semibold text-red-600">
                          {usd(s.usd)}
                          {s.unit ? <span className="font-normal text-text-muted"> / {s.unit}</span> : null}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-text-muted">{s.description}</span>
                    </label>
                    {s.unit && qty > 0 ? (
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={qty}
                        onChange={(e) => setExtraQty(s.id, Math.max(1, Number(e.target.value)))}
                        aria-label={`Количество: ${s.label}`}
                        className="w-16 rounded-lg border border-border px-2 py-1 text-sm"
                      />
                    ) : null}
                  </div>
                );
              })}

              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Страхование авто
              </p>
              <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-2.5">
                <input
                  type="checkbox"
                  checked={withInsurance}
                  onChange={(e) => setWithInsurance(e.target.checked)}
                  className="mt-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-text-primary">Застраховать авто</span>
                    {insuranceUsd(bid + fees) ? (
                      <span className="font-semibold text-red-600">
                        {usd(insuranceUsd(bid + fees)!.usd)}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    До $4000 — $150 · $4001–8000 — $300 · свыше $8000 — 3%. {INSURANCE_NOTE}
                  </span>
                </span>
              </label>
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <EstimateNotice />
          <div className="card-premium rounded-xl p-5 sm:p-6">
            {quote ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  Просчёт авто
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {quote.minskDeliveryUsd > 0
                    ? "Расходы до Минска (без таможни)"
                    : "Расходы до Беларуси (без таможни)"}
                </p>
                {quote.delivery ? (
                  <p className="mt-2 font-display text-3xl font-semibold text-accent-dark">
                    {usd(Math.round(grandUsd))}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-amber-700">
                    Площадка не найдена в прайсе. Выберите город из списка или укажите доставку по США и
                    море вручную.
                  </p>
                )}
                <dl className="mt-4 space-y-2 text-sm">
                  <Line label="Ставка" value={usd(quote.bid)} />
                  <Line label="Аукционный сбор" value={usd(quote.auctionFeesUsd)} />
                  {quote.delivery ? (
                    <>
                      <Line
                        label="Доставка по США"
                        value={usd(quote.delivery.inlandUsd)}
                        hint={
                          quote.delivery.fromTariff
                            ? quote.delivery.matchedLocation || undefined
                            : "ручной ввод"
                        }
                      />
                      <Line
                        label={`Море → ${quote.delivery.oceanDestination === "poti" ? "Poti" : "Klaipeda"}`}
                        value={usd(quote.delivery.oceanUsd)}
                        hint={
                          [
                            quote.delivery.usPortLabel,
                            effectiveLoad === 3 && size !== "moto" ? "контейнер на 3 авто" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || undefined
                        }
                      />
                    </>
                  ) : null}
                  {quote.titleDocUsd > 0 ? (
                    <div className="-mx-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5">
                      <Line
                        label="⚠ Документы (Title / Sale Doc)"
                        value={usd(quote.titleDocUsd)}
                        hint={titleCode}
                      />
                    </div>
                  ) : (
                    <Line label="Title / Sale Doc" value="без доплат" />
                  )}
                  {quote.delivery ? (
                    <>
                      {quote.isSublot ? (
                        <Line label="Sublot / Offsite" value={usd(quote.sublotUsd)} />
                      ) : null}
                      <Line
                        label="Услуги компании США"
                        value={usd(quote.dispatchingUsd)}
                        hint="выкуп и диспетчирование"
                      />
                      <Line label="Оформление документов" value={usd(quote.docsFeeUsd)} />
                      <Line
                        label={`Комиссия ${(quote.transferFeeRate * 100).toFixed(1)}%`}
                        value={usd(quote.transferFee, 2)}
                      />
                      <Line label="Итого США" value={usd(Math.round(quote.usaWithFees))} total />
                      {selectedExtras.map((s) => {
                        const qty = extras[s.id] || 0;
                        return (
                          <Line
                            key={s.id}
                            label={s.label}
                            value={usd(s.usd * qty)}
                            hint={s.unit && qty > 1 ? `${qty} × ${usd(s.usd)}` : undefined}
                          />
                        );
                      })}
                      {insurance ? (
                        <Line label="Страхование" value={usd(insurance.usd, insurance.usd % 1 ? 2 : 0)} hint={insurance.tier} />
                      ) : null}
                      {quote.minskDeliveryUsd > 0 ? (
                        <>
                          <Line
                            label={quote.minskDeliveryLabel}
                            value={usd(quote.minskDeliveryUsd)}
                            hint={quote.minskDeliveryHint || undefined}
                          />
                          <Line label="Итого до Минска" value={usd(Math.round(grandUsd))} total />
                        </>
                      ) : addonsUsd > 0 ? (
                        <Line label="Итого с доп. услугами" value={usd(Math.round(grandUsd))} total />
                      ) : null}
                    </>
                  ) : null}
                </dl>
                {quote.delivery?.oceanDestination === "klaipeda" ? (
                  <p className="mt-3 text-xs text-text-muted">{KLAIPEDA_MINSK_NOTE}</p>
                ) : null}
                {quote.titleFeeInfo?.unmatched ? (
                  <p className="mt-3 text-xs text-amber-700">
                    Title не сопоставлен с прайсом — доплата 0. Выберите тип из списка.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-text-muted">Введите ставку</p>
            )}
          </div>

          <div className="card-premium rounded-xl p-5 sm:p-6">
            <CustomsByPanel
              priceUsd={pricedQuote?.usaWithFees ?? null}
              year={year}
              engine={lotEngine}
              fuel={lotFuel}
              lotKey={lotKey}
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
                  {quote!.minskDeliveryUsd > 0 ? "До Минска" : "США"}{" "}
                  {usd(Math.round(grandUsd))} + таможня ≈{" "}
                  {usd(Math.round(customs.totalUsd || 0))} ({byn(Math.round(customs.totalByn))})
                </p>
              ) : null}
            </div>
          ) : null}

          <ShowcasePickButtons
            pick={
              grandWithCustoms != null && bid > 0
                ? {
                    kind: "restoration",
                    ...(lotCard ?? { region: "usa" }),
                    title:
                      [lotCard?.year, lotCard?.make, lotCard?.model].filter(Boolean).join(" ") ||
                      lotMeta || "Авто под восстановление",
                    lot_url: lotUrl.trim(),
                    location,
                    bid,
                    currency: "USD",
                    total_usd: grandWithCustoms,
                    summary: customs?.ok
                      ? "Под ключ с растаможкой РБ"
                      : "Под ключ, без растаможки",
                  }
                : null
            }
          />
        </div>
      </div>
    </div>
  );
}

function DocumentWarning({
  costUsd,
  docName,
  lotSaleDoc,
  unmatched,
}: {
  costUsd: number;
  docName: string;
  lotSaleDoc: string | null;
  unmatched: boolean;
}) {
  if (unmatched) {
    return (
      <div role="alert" className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm text-red-900">
        <p className="font-semibold">⚠ Внимание: документ требует проверки</p>
        <p className="mt-1 text-xs leading-relaxed">
          Документ лота «{lotSaleDoc}» не найден в нашем прайсе. Оформление документов может стоить
          дополнительных денег (до $500). Выберите тип документа вручную или уточните у менеджера до
          ставки.
        </p>
      </div>
    );
  }
  if (costUsd > 0) {
    return (
      <div role="alert" className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">⚠ Внимание: документы на это авто стоят денег — +{usd(costUsd)}</p>
        <p className="mt-1 text-xs leading-relaxed">
          Тип документа: {docName}. Доплата за оформление уже добавлена в расчёт. Учитывайте её при
          выборе ставки.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">
      <p className="font-semibold">✓ Документы без доплат</p>
      <p className="mt-0.5">
        Обратите внимание: в зависимости от типа документа (Bill of Sale, Parts only, Lien, Junk и др.)
        оформление может стоить от $50 до $500. Проверяйте Sale Document на странице лота.
      </p>
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
