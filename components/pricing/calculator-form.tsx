"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CopartQuote } from "@/lib/pricing/copart-uk";
import type { IaaiQuote } from "@/lib/pricing/iaai-usa";
import {
  classifyVehicle,
  listUkDeliveryLocations,
  resolveRegion,
  VEHICLE_TYPE_OPTIONS,
} from "@/lib/pricing";
import { CopartQuoteDisplay, IaaiQuoteDisplay } from "@/components/pricing/quote-display";
import { computeCalculatorQuote, QuoteTotals } from "@/components/pricing/live-quote";
import { parseBidInput, useFxRate } from "@/components/pricing/use-fx-rate";
import { fetchLotFromUrl, type LotFromUrlResponse } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import { LotLoadButton, LotLoadStatus, lotLoadErrorMessage } from "@/components/pricing/lot-url-load";
import { kitLotUrlError, lotHost, ukKitLotUrlError, usaKitLotUrlError } from "@/lib/pricing/lot-url";
import { useRecordQuote } from "@/components/pricing/use-record-quote";

type Tab = "uk" | "usa";

const UK_LOCATIONS = listUkDeliveryLocations();

function kitMarket(url: string, lot: LotFromUrlResponse): Tab {
  if (lotHost(url) === "copart_uk" || lotHost(lot.url || "") === "copart_uk") return "uk";
  const hay = `${lot.source || ""} ${lot.region || ""}`.toLowerCase();
  if (lot.region === "uk" || lot.source === "copart_uk" || hay.includes("copart_uk")) return "uk";
  return "usa";
}

/** Как в desktop-боте: classifyVehicle → значение селекта; без матча → седан. */
function matchBodyFromLot(lot: LotFromUrlResponse): {
  value: string;
  matched: boolean;
  raw: string;
} {
  const raw = [lot.bodyStyle, lot.model, lot.make, lot.title].filter(Boolean).join(" ");
  const classified = classifyVehicle(raw);
  if (classified.vehicleType === "motorcycle") {
    return { value: "motorcycle", matched: classified.matched, raw: lot.bodyStyle || raw };
  }
  if (classified.matched) {
    const map: Record<string, string> = {
      sedan: "sedan",
      suv: "SUV",
      sprinter: "van",
      pickup: "pickup",
    };
    return {
      value: map[classified.dismantleType] || "sedan",
      matched: true,
      raw: (lot.bodyStyle || "").trim() || raw,
    };
  }
  // Common SUV/crossover model codes when Copart leaves bodyStyle empty
  const modelHay = `${lot.model || ""} ${lot.make || ""} ${lot.title || ""}`;
  if (
    /\b(q[23578]|x[1-7]|gl[ces]|gle|gls|tucson|sportage|rav4|cr-?v|cx-?[35]|explorer|escape|equinox|highlander|4runner|wrangler|cherokee|tahoe|suburban|escalade|navigator|outlander|forester|outback|discovery|defender|range\s*rover|land\s*rover|touareg|tiguan|kodiaq|ateca|karoq|cayenne|macan|model\s*y|ioniq\s*[59]|niro|kona|seltos|sorento|santa\s*fe|palisade|pathfinder|murano|rogue|compass|renegade|asx|eclipse\s*cross)\b/i.test(
      modelHay,
    )
  ) {
    return { value: "SUV", matched: true, raw: lot.bodyStyle || lot.model || raw };
  }
  if (/\b(sprinter|transit|vivaro|trafic|crafter|crafter|ducato|boxer|relay|nv[23]00|promaster)\b/i.test(modelHay)) {
    return { value: "van", matched: true, raw: lot.bodyStyle || lot.model || raw };
  }
  if (/\b(hilux|ranger|navara|l200|amarok|canyon|colorado|tacoma|tundra|f-?150|silverado|sierra|ram\s*1500)\b/i.test(modelHay)) {
    return { value: "pickup", matched: true, raw: lot.bodyStyle || lot.model || raw };
  }
  return {
    value: "sedan",
    matched: false,
    raw: (lot.bodyStyle || "").trim() || raw,
  };
}

function matchCategory(lot: LotFromUrlResponse): string {
  const url = String(lot.url || "");
  const title = String(lot.title || "");
  const cleanTitle = /clean[-_\s]?title|clear[-_\s]?title/i.test(`${url} ${title}`);

  const explicit = (lot.category || "").trim().toUpperCase();
  if (/^[ABNSCDXU]$/.test(explicit)) {
    // Clean/Clear title lots are not Cat A/B — drop false positives from page scrape
    if (cleanTitle && (explicit === "A" || explicit === "B")) return "";
    return explicit;
  }

  // Only look at short lot fields — never location (yards) or long blobs
  const hay = [lot.category, lot.title].filter(Boolean).join(" ");
  if (!hay || hay.length > 120) return "";
  if (/buying\s+cat/i.test(hay)) return "";
  const m =
    hay.match(/\b(?:cat(?:egory)?|категор(?:ия)?)\s*[-:.]?\s*([ABNSCDXU])(?![A-Za-z])/i) ||
    hay.match(/\b([ABNSCDXU])\s*[-–]?\s*(?:category|cat)\b/i);
  if (!m) return "";
  const cat = m[1].toUpperCase();
  if (cleanTitle && (cat === "A" || cat === "B")) return "";
  return cat;
}

type InlandRoute = {
  milesNj: number | null;
  milesHouston: number | null;
  portLabel: string | null;
  source: string | null;
  ok: boolean;
};

type Props = {
  /** Стартовый рынок в калькуляторе */
  defaultTab?: Tab;
  /** Скрыть переключатель рынков */
  hideTabs?: boolean;
  /** Не переключать рынок: ссылка другого рынка отклоняется */
  lockMarket?: boolean;
  /** Когда ссылка сама переключает Англию и США */
  onMarketChange?: (tab: Tab) => void;
};

export function CalculatorForm({
  defaultTab = "uk",
  hideTabs = false,
  lockMarket = false,
  onMarketChange,
}: Props) {
  const fx = useFxRate();
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [bidText, setBidText] = useState("5000");
  const [location, setLocation] = useState("WHITBURN");
  const [usaLocation, setUsaLocation] = useState("");
  const [category, setCategory] = useState("");
  const [inlandMilesText, setInlandMilesText] = useState("450");
  const [inlandRoute, setInlandRoute] = useState<InlandRoute | null>(null);
  const [bodyStyle, setBodyStyle] = useState("sedan");
  const [bodyHint, setBodyHint] = useState<string | null>(null);
  const [lotUrl, setLotUrl] = useState("");
  const [lotLoading, setLotLoading] = useState(false);
  const [lotError, setLotError] = useState<string | null>(null);
  const [lotMeta, setLotMeta] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const loadFromUrl = useCallback(async () => {
    const url = lotUrl.trim();
    const rejected = lockMarket
      ? tab === "uk"
        ? ukKitLotUrlError(url)
        : usaKitLotUrlError(url)
      : kitLotUrlError(url);
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
    try {
      const lot = await fetchLotFromUrl(url);
      const market = kitMarket(url, lot);
      if (lockMarket && market !== tab) {
        setLotError(
          market === "uk"
            ? "Это лот из Англии. Он считается в калькуляторе «Англия»"
            : "Это лот из США. Он считается в калькуляторе «США»",
        );
        return;
      }
      setTab(market);
      onMarketChange?.(market);

      const applyUkLocation = (rawLoc: string | null | undefined) => {
        const yard = resolveRegion(rawLoc);
        if (yard && yard !== "DEFAULT") {
          setLocation(yard);
          return yard;
        }
        // Client-side fallback: yard is the last token of Copart UK slug
        const slug = (url.match(/\/lot\/\d+\/([^/?#]+)/i) || [])[1] || "";
        const token = slug.split("-").filter(Boolean).pop()?.toUpperCase() || "";
        const fromSlug = token ? resolveRegion(token) : "DEFAULT";
        if (fromSlug !== "DEFAULT") {
          setLocation(fromSlug);
          return fromSlug;
        }
        setLocation("DEFAULT");
        return "";
      };

      if (lot.ok === false && lot.bid == null && !lot.make && !lot.location) {
        let yardApplied = "";
        if (market === "uk") {
          yardApplied = applyUkLocation(lot.location);
        }
        setLotError(
          yardApplied
            ? `Площадка ${yardApplied} из ссылки — введите ставку вручную`
            : "Лот не загрузился автоматически — введите ставку и площадку вручную",
        );
        if (lot.lotNumber) {
          setLotMeta(
            `#${lot.lotNumber}${yardApplied ? ` · ${yardApplied}` : ""} · введите ставку вручную`,
          );
        }
        setTouched(true);
        return;
      }
      // Partial load (e.g. yard from URL) — still fill the form
      if (lot.ok === false && (lot.location || lot.make || lot.lotNumber)) {
        setLotError(null);
      }
      if (lot.bid != null && Number(lot.bid) > 0) {
        setBidText(String(Math.round(Number(lot.bid))));
      }
      const body = matchBodyFromLot(lot);
      setBodyStyle(body.value);
      setBodyHint(
        body.matched
          ? `Кузов: ${lot.bodyStyle || body.value} → в прайсе`
          : `Кузов: ${lot.bodyStyle || "не указан"} → нет в правилах, седан`,
      );
      if (market === "uk") {
        setInlandRoute(null);
        applyUkLocation(lot.location);
        setCategory(matchCategory(lot));
      } else {
        setUsaLocation(String(lot.location || ""));
        const miles =
          lot.inlandMiles != null && Number(lot.inlandMiles) > 0
            ? Math.round(Number(lot.inlandMiles))
            : 450;
        setInlandMilesText(String(miles));
        setInlandRoute({
          milesNj: lot.milesToNewJersey != null ? Number(lot.milesToNewJersey) : null,
          milesHouston: lot.milesToHouston != null ? Number(lot.milesToHouston) : null,
          portLabel: lot.usPortLabel || null,
          source: lot.distanceSource || null,
          ok: Boolean(lot.inlandOk),
        });
      }
      const yardResolved =
        market === "uk" && lot.location ? resolveRegion(lot.location) : "";
      const yardLabel =
        market === "uk" && lot.location
          ? yardResolved !== "DEFAULT"
            ? yardResolved
            : String(lot.location)
          : lot.location;
      const label = [lot.year, lot.make, lot.model, lot.lotNumber && `#${lot.lotNumber}`]
        .filter(Boolean)
        .join(" ");
      const place = yardLabel ? ` · ${yardLabel}` : "";
      const cat = market === "uk" ? matchCategory(lot) : "";
      const catLabel = cat ? ` · Cat ${cat}` : "";
      const milesLabel =
        market === "usa" && lot.inlandMiles != null
          ? ` · ${Math.round(Number(lot.inlandMiles))} mi`
          : "";
      const yardMiss =
        market === "uk" && lot.location && yardResolved === "DEFAULT"
          ? " · площадка не в прайсе — выберите вручную"
          : market === "uk" && !lot.location
            ? " · площадка не найдена — выберите вручную"
            : "";
      const bidLiveLabel =
        lot.bid != null && Number(lot.bid) > 0
          ? lot.bidLive
            ? " · ставка live"
            : " · ставка со страницы"
          : "";
      const viaLabel = lot.via ? ` · ${lot.via}` : "";
      const milesErr =
        market === "usa" && lot.inlandOk === false && lot.inlandError
          ? ` · мили: ${lot.inlandError}`
          : "";
      setLotMeta(
        `${label || "Лот загружен"}${place}${catLabel}${milesLabel}${yardMiss}${bidLiveLabel}${viaLabel}${milesErr} · ${market === "uk" ? "Англия" : "США"}`,
      );
      setTouched(true);
    } catch (err) {
      setLotError(lotLoadErrorMessage(err));
    } finally {
      setLotLoading(false);
    }
  }, [lotUrl, onMarketChange, lockMarket, tab]);

  const bid = parseBidInput(bidText);
  const fxRate = fx.rate;
  const fxMarketRate = fx.marketRate;

  const quote = useMemo(
    () =>
      computeCalculatorQuote(tab, bidText, { ...fx, rate: fxRate, marketRate: fxMarketRate }, {
        location: tab === "uk" ? location : usaLocation,
        category,
        bodyStyle,
        vatOnSale: false,
        inlandMilesText,
      }),
    [tab, bidText, fx, fxRate, fxMarketRate, location, usaLocation, category, bodyStyle, inlandMilesText],
  );

  const totalUsd =
    quote && "grandUsd" in quote && quote.grandUsd != null ? Math.round(quote.grandUsd) : null;
  useRecordQuote(
    touched && bid > 0 && totalUsd != null
      ? {
          kind: tab === "uk" ? "uk" : "usa",
          title: lotMeta || (tab === "uk" ? "Машинокомплект Англия" : "Машинокомплект США"),
          lot_url: lotUrl.trim(),
          location: tab === "uk" ? location : usaLocation,
          bid,
          currency: tab === "uk" ? "GBP" : "USD",
          total_usd: totalUsd,
          summary: tab === "uk" ? "Машинокомплект · Англия" : "Машинокомплект · США",
        }
      : null,
  );

  return (
    <div onChange={() => setTouched(true)}>
      {!hideTabs && !lockMarket ? (
        <div className="mb-6 flex gap-2 rounded-lg border border-border bg-bg-base p-1">
          {(
            [
              ["uk", "Англия"],
              ["usa", "США"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-11 flex-1 rounded-md px-3 py-2 text-sm font-medium transition sm:px-4 ${
                tab === key ? "bg-accent-dark text-white" : "text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="card-premium space-y-4 rounded-xl p-4 sm:p-6">
          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            {tab === "uk" ? "Ссылка на лот (Copart UK)" : "Ссылка на лот (IAAI / Bid.cars / Copart.com)"}
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
                placeholder={
                  tab === "uk"
                    ? "https://www.copart.co.uk/lot/…"
                    : "https://www.copart.com/lot/… или https://www.iaai.com/…"
                }
                className="w-full flex-1 rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
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
            Ваша ставка ({tab === "uk" ? "GBP" : "USD"})
            <input
              type="number"
              min={0}
              step={1}
              inputMode="decimal"
              value={bidText}
              onChange={(e) => setBidText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-lg font-semibold text-text-primary"
            />
          </label>
          {quote ? (
            <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm">
              Расчёт для {tab === "uk" ? "£" : "$"}
              {bid.toLocaleString("ru-RU")} →{" "}
              <span className="font-display font-bold text-accent-dark">
                {"grandUsd" in quote && quote.grandUsd != null
                  ? `$${Math.round(quote.grandUsd).toLocaleString("en-US")}`
                  : "totalUk" in quote
                    ? `£${Math.round(quote.totalUk).toLocaleString("en-GB")}`
                    : "—"}
              </span>
            </p>
          ) : null}
          <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Тип авто
            <select
              value={bodyStyle}
              onChange={(e) => setBodyStyle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
            >
              {VEHICLE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {bodyHint ? (
              <p className="mt-1 text-xs font-normal normal-case tracking-normal text-text-muted">
                {bodyHint}
              </p>
            ) : null}
          </label>
          {tab === "uk" ? (
            <>
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
                Площадка (регион UK)
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
                >
                  {UK_LOCATIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  <option value="DEFAULT">DEFAULT (прочее)</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
                Категория
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary"
                >
                  <option value="">—</option>
                  <option value="A">Cat A</option>
                  <option value="B">Cat B</option>
                  <option value="S">Cat S</option>
                  <option value="N">Cat N</option>
                </select>
              </label>
            </>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-text-muted">
                Мили до порта США ($1/mi)
                <input
                  type="text"
                  inputMode="numeric"
                  value={inlandMilesText}
                  onChange={(e) => setInlandMilesText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                />
              </label>
              {inlandRoute ? (
                <div className="rounded-lg border border-border bg-bg-base px-3 py-2 text-xs text-text-secondary">
                  <p>
                    New Jersey:{" "}
                    <span className="font-medium text-text-primary">
                      {inlandRoute.milesNj != null ? `${Math.round(inlandRoute.milesNj)} mi` : "—"}
                    </span>
                  </p>
                  <p>
                    Houston:{" "}
                    <span className="font-medium text-text-primary">
                      {inlandRoute.milesHouston != null
                        ? `${Math.round(inlandRoute.milesHouston)} mi`
                        : "—"}
                    </span>
                  </p>
                  <p>
                    Ближе порт:{" "}
                    <span className="font-medium text-text-primary">
                      {inlandRoute.portLabel || "—"}
                    </span>
                    {inlandMilesText
                      ? ` · ${inlandMilesText} mi → $${Math.round(parseBidInput(inlandMilesText) || 0)}`
                      : ""}
                  </p>
                  {!inlandRoute.ok ? (
                    <p className="mt-1 text-amber-700">Мили по карте не найдены — fallback 450 mi</p>
                  ) : inlandRoute.source ? (
                    <p className="mt-1 text-text-muted">Источник: {inlandRoute.source}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="card-premium rounded-xl p-6" key={`${tab}-${bidText}-${fxRate}`}>
          {tab === "uk" && quote ? <CopartQuoteDisplay quote={quote as CopartQuote} /> : null}
          {tab === "usa" && quote ? (
            <IaaiQuoteDisplay quote={quote as IaaiQuote} route={inlandRoute} />
          ) : null}
          {quote ? <QuoteTotals quote={quote} region={tab} /> : null}
        </div>
      </div>
    </div>
  );
}
