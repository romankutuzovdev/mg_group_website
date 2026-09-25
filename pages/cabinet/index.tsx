"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { DealRouteSections } from "@/components/cabinet/deal-route-sections";
import { DealDismantleMap } from "@/components/cabinet/deal-dismantle-map";
import { DealPhotos, dealCoverPhotoUrl } from "@/components/cabinet/deal-photos";
import { DealPaymentStatus, paymentProgressLabel } from "@/components/cabinet/deal-payment-status";
import { DealClosingStages } from "@/components/cabinet/deal-closing-stages";
import { AdminDealsPanel } from "@/components/cabinet/admin-deals-panel";
import { PurchasedCarsAdmin } from "@/components/cabinet/purchased-cars-admin";
import { CabinetCalculator } from "@/components/cabinet/cabinet-calculator";
import { FavoriteButton } from "@/components/auctions/favorite-button";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { consultationMessage } from "@/lib/company";
import { isApiEnabled } from "@/lib/api/config";
import {
  type CabinetUser,
  type Deal,
  type FavoriteLot,
  type TelegramLoginUser,
  fetchFavorites,
  fetchMe,
  fetchMyDeal,
  fetchMyDeals,
  fetchTelegramAuthConfig,
  getCabinetToken,
  loginWithTelegram,
  setCabinetToken,
} from "@/lib/api/cabinet";
import { ensureTelegramWebAppAuth, isTelegramWebAppEnv } from "@/lib/telegram-webapp-auth";
import { hydrateFavorites, resetFavoritesCache, subscribeFavorites } from "@/lib/favorites-cache";

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginUser) => void;
  }
}

type View = "list" | "detail";

function statusLabel(status: Deal["status"]): string {
  if (status === "completed") return "Завершена";
  if (status === "cancelled") return "Отменена";
  return "В работе";
}

function formatMoney(amount: number, currency: string) {
  const cur = currency === "GBP" ? "GBP" : "USD";
  return new Intl.NumberFormat(cur === "GBP" ? "en-GB" : "en-US", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function dealProgress(deal: Deal) {
  const stages = deal.stages || [];
  const done = stages.filter((s) => s.status === "done").length;
  const active = stages.find((s) => s.status === "active");
  return {
    done,
    total: Math.max(stages.length, 1),
    current: active?.label || (deal.status === "completed" ? "Готово" : "Ожидание"),
  };
}

type Tab = "deals" | "favorites" | "calc" | "manager";

const TAB_IDS: Tab[] = ["deals", "favorites", "calc", "manager"];

function tabFromQuery(raw: string | null): Tab | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "calculator" || v === "calc" || v === "просчет" || v === "просчёт") return "calc";
  if (v === "favorites" || v === "fav" || v === "избранное") return "favorites";
  if (v === "manager" || v === "admin" || v === "менеджер") return "manager";
  if (v === "deals" || v === "сделки") return "deals";
  return TAB_IDS.includes(v as Tab) ? (v as Tab) : null;
}

function CabinetApp({ dictionary }: { dictionary: Dictionary }) {
  const [user, setUser] = useState<CabinetUser | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [favorites, setFavorites] = useState<FavoriteLot[]>([]);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [view, setView] = useState<View>("list");
  const [tab, setTab] = useState<Tab>("deals");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState("");
  const [authEnabled, setAuthEnabled] = useState(false);
  const [webAppAuth, setWebAppAuth] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Deep-link: /cabinet/?tab=calc opens the calculator tab after login
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const fromQuery = tabFromQuery(params.get("tab") || params.get("view"));
    if (fromQuery) setTab(fromQuery);
  }, []);

  const selectTab = useCallback((next: Tab) => {
    setTab(next);
    setView("list");
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* ignore */
    }
  }, []);

  const loadDeals = useCallback(async () => {
    const items = await fetchMyDeals();
    setDeals(items);
  }, []);

  const loadFavorites = useCallback(async () => {
    const items = await fetchFavorites();
    setFavorites(items);
    hydrateFavorites(items.map((f) => f.lot_id));
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isApiEnabled()) {
        setError("API не настроен (NEXT_PUBLIC_API_URL).");
        return;
      }
      const cfg = await fetchTelegramAuthConfig();
      setBotUsername(cfg.bot_username);
      setAuthEnabled(cfg.enabled);

      // Mini App: silent login via initData (no Telegram Login Widget)
      if (!getCabinetToken()) {
        const ok = await ensureTelegramWebAppAuth();
        if (ok) setWebAppAuth(true);
      } else if (isTelegramWebAppEnv()) {
        setWebAppAuth(true);
      }

      const token = getCabinetToken();
      if (!token) {
        setUser(null);
        return;
      }
      const me = await fetchMe();
      setUser(me);
      await Promise.all([loadDeals(), loadFavorites()]);
    } catch (err) {
      setCabinetToken(null);
      resetFavoritesCache();
      setUser(null);
      setDeals([]);
      setFavorites([]);
      setError(err instanceof Error ? err.message : "Не удалось загрузить кабинет");
    } finally {
      setLoading(false);
    }
  }, [loadDeals, loadFavorites]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!user) return;
    return subscribeFavorites(() => {
      void loadFavorites().catch(() => undefined);
    });
  }, [user, loadFavorites]);

  useEffect(() => {
    window.onTelegramAuth = async (tgUser) => {
      setError(null);
      setLoading(true);
      try {
        const res = await loginWithTelegram(tgUser);
        setUser(res.user);
        resetFavoritesCache();
        await Promise.all([loadDeals(), loadFavorites()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка входа через Telegram");
      } finally {
        setLoading(false);
      }
    };
    return () => {
      delete window.onTelegramAuth;
    };
  }, [loadDeals, loadFavorites]);

  useEffect(() => {
    // In Mini App we never show the Login Widget — auth is silent
    if (user || webAppAuth || !authEnabled || !botUsername || !widgetRef.current) return;
    if (isTelegramWebAppEnv()) return;
    widgetRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    widgetRef.current.appendChild(script);
  }, [user, webAppAuth, authEnabled, botUsername, loading]);

  const openDeal = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const deal = await fetchMyDeal(id);
      setSelected(deal);
      setView("detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть сделку");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setCabinetToken(null);
    resetFavoritesCache();
    setUser(null);
    setDeals([]);
    setFavorites([]);
    setSelected(null);
    setView("list");
  };

  return (
    <PageShell bare>
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading && !user ? (
        <p className="text-sm text-text-secondary">Загрузка…</p>
      ) : null}

      {!user ? (
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <div className="mx-auto max-w-md rounded-xl border border-border bg-bg-elevated p-5 text-center">
            <p className="text-base font-semibold">
              {webAppAuth || isTelegramWebAppEnv()
                ? "Вход через Telegram…"
                : "Войти через Telegram"}
            </p>
            {webAppAuth || isTelegramWebAppEnv() ? (
              <p className="mt-3 text-sm text-text-secondary">
                Авторизация Mini App… Подождите секунду.
              </p>
            ) : (
              <div className="mt-4 flex min-h-[40px] items-center justify-center" ref={widgetRef} />
            )}
            {!authEnabled && !(webAppAuth || isTelegramWebAppEnv()) ? (
              <p className="mt-3 text-xs text-text-muted">
                Виджет недоступен: на API задайте TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME,
                в BotFather укажите Domain сайта.
              </p>
            ) : null}
            <p className="mt-4 text-xs text-text-muted">
              Нет сделки?{" "}
              <a
                href={dictionary.global.tgLink}
                className="font-medium text-accent-dark underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                Написать менеджеру
              </a>
              {" · "}
              <a
                href="/calculator/"
                className="font-medium text-accent-dark underline underline-offset-2"
              >
                Калькулятор на сайте
              </a>
            </p>
          </div>

          {/* Calculators work without Telegram login */}
          <CabinetCalculator />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-elevated p-3">
            <div className="flex items-center gap-2.5">
              {user.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photo_url}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                  {(user.first_name || "U").slice(0, 1)}
                </div>
              )}
              <div>
                <p className="text-sm font-medium leading-tight">
                  {user.first_name} {user.last_name}
                  {user.is_admin ? (
                    <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-dark">
                      Менеджер
                    </span>
                  ) : null}
                </p>
                <p className="text-[11px] text-text-muted">
                  {user.username ? `@${user.username}` : `ID ${user.telegram_id}`}
                </p>
              </div>
            </div>
            {!webAppAuth && !isTelegramWebAppEnv() ? (
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50"
              >
                Выйти
              </button>
            ) : null}
          </div>

          {view === "list" ? (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-zinc-50 p-1">
                {(
                  [
                    { id: "deals" as const, label: `Сделки${deals.length ? ` (${deals.length})` : ""}` },
                    {
                      id: "favorites" as const,
                      label: `Избранное${favorites.length ? ` (${favorites.length})` : ""}`,
                    },
                    { id: "calc" as const, label: "Калькулятор" },
                    ...(user.is_admin
                      ? [{ id: "manager" as const, label: "Менеджер" }]
                      : []),
                  ] as { id: Tab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTab(t.id)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      tab === t.id
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-text-secondary hover:text-zinc-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "favorites" ? (
              <div>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Избранные авто</h2>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Лоты, за которыми вы следите. Добавляйте сердечком на карточках аукциона.
                    </p>
                  </div>
                  <Link
                    href="/auctions/"
                    className="text-xs font-medium text-accent-dark underline underline-offset-2"
                  >
                    К аукционам →
                  </Link>
                </div>
                {favorites.length === 0 ? (
                  <p className="mt-2 text-sm text-text-secondary">
                    Пока пусто — откройте каталог и нажмите ♥ на интересном лоте.
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {favorites.map((fav) => (
                      <li key={fav.lot_id}>
                        <div className="relative overflow-hidden rounded-lg border border-border bg-white">
                          <Link
                            href={`/auctions/${fav.slug}/`}
                            className="flex gap-3 p-2.5 pr-12 transition hover:bg-accent/[0.03]"
                          >
                            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-zinc-100">
                              {fav.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={fav.image_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{fav.title}</p>
                              <p className="mt-0.5 text-xs text-text-secondary">
                                {formatMoney(fav.current_bid, fav.currency)}
                                {fav.source ? ` · ${fav.source}` : ""}
                              </p>
                              {fav.auction_date ? (
                                <p className="mt-0.5 text-[11px] text-text-muted">
                                  {new Date(fav.auction_date).toLocaleString("ru-RU", {
                                    day: "numeric",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                              ) : null}
                            </div>
                          </Link>
                          <div className="absolute right-2 top-2">
                            <FavoriteButton
                              lotId={fav.lot_id}
                              className="!border-zinc-200 !bg-white !text-rose-500 hover:!bg-zinc-50"
                            />
                          </div>
                          <div className="border-t border-border px-2.5 py-2">
                            <a
                              href={consultationMessage(
                                [
                                  "Здравствуйте! Нужен Carfax / история авто по избранному лоту.",
                                  fav.title,
                                  fav.source ? `Площадка: ${fav.source}` : null,
                                  `Ссылка: https://www.multiglobalgroup.com/auctions/${fav.slug}/`,
                                  "Оформите, пожалуйста, через менеджера.",
                                ]
                                  .filter(Boolean)
                                  .join("\n"),
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex w-full items-center justify-center rounded-md border border-[#1B5E20]/30 bg-[#1B5E20]/5 px-3 py-2 text-xs font-semibold text-[#0D3F10] transition hover:bg-[#1B5E20]/10"
                            >
                              Заказать Carfax
                            </a>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              ) : null}

              {tab === "deals" ? (
              <div>
                <h2 className="text-sm font-semibold">Ваши сделки</h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  Сделки создаёт менеджер — здесь путь авто, фото и карта разбора.
                </p>
                {deals.length === 0 ? (
                  <p className="mt-2 text-sm text-text-secondary">
                    Пока пусто — сделка появится, когда менеджер её создаст.
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-2">
                    {deals.map((deal) => {
                      const p = dealProgress(deal);
                      const cover = dealCoverPhotoUrl(deal);
                      const photoCount = (deal.media || []).filter(
                        (m) => m.kind === "photo",
                      ).length;
                      return (
                      <li key={deal.id}>
                        <button
                          type="button"
                          onClick={() => void openDeal(deal.id)}
                          className="flex w-full gap-3 rounded-lg border border-border bg-white p-3 text-left transition hover:border-accent/40 hover:bg-accent/[0.03]"
                        >
                          <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100 sm:h-20 sm:w-28">
                            {cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={cover}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                                Нет фото
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium">{deal.title}</span>
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                              {statusLabel(deal.status)}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-muted">
                            {[
                              deal.lot_number && `#${deal.lot_number}`,
                              deal.vin,
                              deal.origin_region === "uk" ? "Англия" : "США",
                              deal.origin_point === "dismantle" ? "машинокомплект" : "порт",
                              paymentProgressLabel(deal),
                              photoCount ? `${photoCount} фото` : null,
                              deal.price
                                ? formatMoney(deal.price, deal.currency || "USD")
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Без VIN / лота"}
                          </p>
                          <div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{
                                  width: `${Math.round((p.done / p.total) * 100)}%`,
                                }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] text-text-muted">
                              {p.done}/{p.total} этапов · сейчас: {p.current}
                            </p>
                          </div>
                          <DealClosingStages deal={deal} compact />
                          </div>
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              ) : null}

              {tab === "calc" ? <CabinetCalculator /> : null}

              {tab === "manager" && user.is_admin ? (
                <div className="space-y-6">
                  <AdminDealsPanel
                    onCreated={(deal) => {
                      setDeals((prev) => {
                        if (prev.some((d) => d.id === deal.id)) return prev;
                        return [deal, ...prev];
                      });
                    }}
                    onOpenDeal={(id) => void openDeal(id)}
                  />
                  <div className="border-t border-border pt-5">
                    <h2 className="text-sm font-semibold">Купленные авто (витрина)</h2>
                    <p className="mt-0.5 mb-3 text-xs text-text-muted">
                      Добавление машин на публичную витрину купленных.
                    </p>
                    <PurchasedCarsAdmin />
                  </div>
                </div>
              ) : null}
            </div>
          ) : selected ? (
            <div>
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setSelected(null);
                  void loadFavorites();
                }}
                className="text-xs font-medium text-accent-dark underline underline-offset-2"
              >
                ← Назад в кабинет
              </button>
              <div className="mt-2 space-y-3">
                <div className="rounded-xl border border-border bg-bg-elevated p-3.5 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold">{selected.title}</h2>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {[selected.lot_number && `Лот ${selected.lot_number}`, selected.vin]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {statusLabel(selected.status)}
                    </span>
                  </div>
                  {selected.note ? (
                    <p className="mt-2 text-sm text-text-secondary">{selected.note}</p>
                  ) : null}
                  <div className="mt-3 border-t border-border pt-3">
                    <DealClosingStages deal={selected} />
                  </div>
                </div>

                <DealPhotos
                  deal={selected}
                  isAdmin={user.is_admin}
                  onUpdated={(next) => {
                    setSelected(next);
                    setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                  }}
                />

                <DealPaymentStatus
                  deal={selected}
                  isAdmin={user.is_admin}
                  onUpdated={(next) => {
                    setSelected(next);
                    setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                  }}
                />

                <DealRouteSections
                  deal={selected}
                  isAdmin={user.is_admin}
                  onUpdated={(next) => {
                    setSelected(next);
                    setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                  }}
                />

                <DealDismantleMap deal={selected} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

export default function CabinetPage() {
  const dictionary = getDictionary();
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Личный кабинет | MG.GROUP",
            description:
              "Личный кабинет MG.GROUP: избранные лоты, сделки и этапы доставки.",
          },
        }}
        lang="ru"
        path="/cabinet/"
      />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <CabinetApp dictionary={dictionary} />
    </>
  );
}
