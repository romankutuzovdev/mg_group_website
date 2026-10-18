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
import { LogisticsPanel } from "@/components/cabinet/logistics-panel";
import { PurchasedCarsAdmin } from "@/components/cabinet/purchased-cars-admin";
import { QuoteHistoryPanel } from "@/components/cabinet/quote-history-panel";
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
  loginDev,
  loginWithPassword,
  loginWithTelegram,
  setCabinetToken,
  stageKeysForDeal,
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
  const allowed = new Set(stageKeysForDeal(deal));
  const stages = (deal.stages || []).filter((s) => allowed.has(s.key));
  const done = stages.filter((s) => s.status === "done").length;
  const active = stages.find((s) => s.status === "active");
  return {
    done,
    total: Math.max(stages.length, 1),
    current: active?.label || (deal.status === "completed" ? "Готово" : "Ожидание"),
  };
}

type Tab = "deals" | "favorites" | "quotes" | "manager" | "logistics";

const TAB_IDS: Tab[] = ["deals", "favorites", "quotes", "manager", "logistics"];

function tabFromQuery(raw: string | null): Tab | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "favorites" || v === "fav" || v === "избранное") return "favorites";
  if (v === "quotes" || v === "просчеты" || v === "просчёты" || v === "history") return "quotes";
  if (v === "manager" || v === "admin" || v === "менеджер") return "manager";
  if (v === "logistics" || v === "логистика" || v === "containers" || v === "контейнеры")
    return "logistics";
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
  const [devAuthEnabled, setDevAuthEnabled] = useState(false);
  const [webAppAuth, setWebAppAuth] = useState(false);
  const [phoneLogin, setPhoneLogin] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Deep-link: /cabinet/?tab=favorites|manager|deals
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
      setDevAuthEnabled(Boolean(cfg.dev_enabled));

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

  const loginByPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneLogin.trim() || !phonePassword) {
      setError("Введите телефон и пароль");
      return;
    }
    setPhoneBusy(true);
    setError(null);
    try {
      const res = await loginWithPassword(phoneLogin.trim(), phonePassword);
      setUser(res.user);
      setPhonePassword("");
      await Promise.all([loadDeals(), loadFavorites()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неверный телефон или пароль");
    } finally {
      setPhoneBusy(false);
    }
  };

  const isStaff = Boolean(user?.is_admin || user?.is_manager);
  const activeDeals = deals.filter((d) => d.status === "active").length;

  return (
    <PageShell bare className="!max-w-none">
      <div className="relative -mx-3 -mt-3 mb-4 overflow-hidden border-b border-zinc-200/80 bg-white sm:-mx-4 lg:-mx-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_120px_at_0%_0%,rgba(16,185,129,0.1),transparent),radial-gradient(600px_100px_at_100%_0%,rgba(24,24,27,0.04),transparent)]" />
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-3.5 sm:px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-[11px] font-bold text-white"
            >
              MG
            </Link>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700/80">
                Client workspace
              </p>
              <p className="text-sm font-semibold text-zinc-900">Личный кабинет</p>
            </div>
          </div>
          <Link
            href="/"
            className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
          >
            На сайт
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {!user ? (
        <div className="flex w-full flex-1 flex-col gap-6 pb-8">
          <div className="mx-auto w-full max-w-md space-y-4">
            <div className="text-center sm:pt-4">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                Вход в кабинет
              </h1>
              <p className="mt-1.5 text-sm text-zinc-500">
                Следите за сделками, картой разбора и избранным
              </p>
            </div>
            <form
              onSubmit={(e) => void loginByPhone(e)}
              className="rounded-2xl border border-zinc-200/90 bg-white p-5 text-left shadow-[0_8px_30px_-18px_rgba(15,23,42,0.35)] sm:p-6"
            >
              <p className="text-sm font-semibold text-zinc-900">По телефону</p>
              <p className="mt-1 text-xs text-zinc-500">
                Логин и пароль выдаёт ваш менеджер
              </p>
              <label className="mt-5 block text-xs font-medium text-zinc-500">
                Телефон
                <input
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-3 text-sm outline-none ring-emerald-500/25 transition focus:bg-white focus:ring-2"
                  value={phoneLogin}
                  onChange={(e) => setPhoneLogin(e.target.value)}
                  placeholder="+375 29 123-45-67"
                  inputMode="tel"
                  autoComplete="username"
                  required
                />
              </label>
              <label className="mt-3 block text-xs font-medium text-zinc-500">
                Пароль
                <input
                  type="password"
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-3 text-sm outline-none ring-emerald-500/25 transition focus:bg-white focus:ring-2"
                  value={phonePassword}
                  onChange={(e) => setPhonePassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={phoneBusy}
                className="mt-5 w-full rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {phoneBusy ? "Входим…" : "Войти"}
              </button>
            </form>

            {devAuthEnabled ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-center">
                <p className="text-xs font-semibold text-amber-900">Локальный тест</p>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    disabled={phoneBusy}
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => {
                      void (async () => {
                        setPhoneBusy(true);
                        setError(null);
                        try {
                          const res = await loginDev("manager");
                          setUser(res.user);
                          resetFavoritesCache();
                          await Promise.all([loadDeals(), loadFavorites()]);
                        } catch (err) {
                          setError(
                            err instanceof Error ? err.message : "Ошибка тестового входа",
                          );
                        } finally {
                          setPhoneBusy(false);
                        }
                      })();
                    }}
                  >
                    Войти как менеджер
                  </button>
                  <button
                    type="button"
                    disabled={phoneBusy}
                    className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 disabled:opacity-50"
                    onClick={() => {
                      void (async () => {
                        setPhoneBusy(true);
                        setError(null);
                        try {
                          const res = await loginDev("client");
                          setUser(res.user);
                          resetFavoritesCache();
                          await Promise.all([loadDeals(), loadFavorites()]);
                        } catch (err) {
                          setError(
                            err instanceof Error ? err.message : "Ошибка тестового входа",
                          );
                        } finally {
                          setPhoneBusy(false);
                        }
                      })();
                    }}
                  >
                    Войти как клиент
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">
                {webAppAuth || isTelegramWebAppEnv()
                  ? "Вход через Telegram…"
                  : "Или через Telegram"}
              </p>
              {webAppAuth || isTelegramWebAppEnv() ? (
                <p className="mt-3 text-sm text-zinc-500">
                  Авторизация Mini App… Подождите секунду.
                </p>
              ) : (
                <div className="mt-4 flex min-h-[40px] items-center justify-center" ref={widgetRef} />
              )}
              {!authEnabled && !(webAppAuth || isTelegramWebAppEnv()) ? (
                <p className="mt-3 text-xs text-zinc-400">
                  Виджет Telegram пока не настроен на API.
                </p>
              ) : null}
              <p className="mt-4 text-xs text-zinc-500">
                Нет доступа?{" "}
                <a
                  href={dictionary.global.tgLink}
                  className="font-semibold text-emerald-800 underline underline-offset-2"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Написать менеджеру
                </a>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-1 flex-col space-y-4 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/90 bg-white p-3.5 shadow-sm sm:p-4">
            <div className="flex items-center gap-3">
              {user.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photo_url}
                  alt=""
                  className="h-11 w-11 rounded-xl object-cover ring-1 ring-zinc-200"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-bold text-white shadow-sm">
                  {(user.first_name || "U").slice(0, 1)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold leading-tight text-zinc-900">
                  {user.first_name} {user.last_name}
                  {user.is_admin ? (
                    <span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200/80">
                      Админ
                    </span>
                  ) : user.is_manager ? (
                    <span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200/80">
                      Менеджер
                    </span>
                  ) : (
                    <span className="ml-2 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                      Клиент
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {user.phone
                    ? user.phone
                    : user.username
                      ? `@${user.username}`
                      : `ID ${user.telegram_id}`}
                </p>
              </div>
            </div>
            {!webAppAuth && !isTelegramWebAppEnv() ? (
              <button
                type="button"
                onClick={logout}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50"
              >
                Выйти
              </button>
            ) : null}
          </div>

          {!isStaff && view === "list" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: "Сделки", value: deals.length },
                { label: "В работе", value: activeDeals },
                { label: "Избранное", value: favorites.length },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-zinc-200/90 bg-white px-3.5 py-3 shadow-sm"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900">
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {view === "list" ? (
            <div className="space-y-5">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                {(
                  [
                    { id: "deals" as const, label: `Сделки${deals.length ? ` · ${deals.length}` : ""}` },
                    {
                      id: "favorites" as const,
                      label: `Избранное${favorites.length ? ` · ${favorites.length}` : ""}`,
                    },
                    ...(isStaff
                      ? [
                          { id: "quotes" as const, label: "Просчёты" },
                          { id: "manager" as const, label: "Менеджер" },
                          { id: "logistics" as const, label: "Логистика" },
                        ]
                      : []),
                  ] as { id: Tab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTab(t.id)}
                    className={`shrink-0 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                      tab === t.id
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "favorites" ? (
              <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-zinc-900">Избранные авто</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Лоты, за которыми вы следите. Добавляйте ♥ на карточках аукциона.
                    </p>
                  </div>
                  <Link
                    href="/auctions/"
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700"
                  >
                    К аукционам →
                  </Link>
                </div>
                {favorites.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500">
                    Пока пусто — откройте каталог и нажмите ♥ на интересном лоте.
                  </div>
                ) : (
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {favorites.map((fav) => (
                      <li key={fav.lot_id}>
                        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/40 shadow-sm transition hover:border-emerald-300/60 hover:shadow-md">
                          <Link
                            href={`/auctions/${fav.slug}/`}
                            className="flex gap-3 p-3 pr-12"
                          >
                            <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
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
                              <p className="truncate text-sm font-semibold text-zinc-900">{fav.title}</p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {formatMoney(fav.current_bid, fav.currency)}
                                {fav.source ? ` · ${fav.source}` : ""}
                              </p>
                              {fav.auction_date ? (
                                <p className="mt-1 text-[11px] text-zinc-400">
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
                          <div className="absolute right-2.5 top-2.5">
                            <FavoriteButton
                              lotId={fav.lot_id}
                              className="!border-zinc-200 !bg-white !text-rose-500 hover:!bg-zinc-50"
                            />
                          </div>
                          <div className="border-t border-zinc-100 px-3 py-2.5">
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
                              className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
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
                <div className="mb-3">
                  <h2 className="text-base font-semibold text-zinc-900">Ваши сделки</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Сделки создаёт менеджер — здесь путь авто, фото и карта разбора.
                  </p>
                </div>
                {deals.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center shadow-sm">
                    <p className="text-sm font-semibold text-zinc-800">Пока нет сделок</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Когда менеджер создаст авто, оно появится здесь.
                    </p>
                  </div>
                ) : (
                  <ul className="grid gap-3">
                    {deals.map((deal) => {
                      const p = dealProgress(deal);
                      const cover = dealCoverPhotoUrl(deal);
                      const photoCount = (deal.media || []).filter(
                        (m) => m.kind === "photo",
                      ).length;
                      const pct = Math.round((p.done / Math.max(p.total, 1)) * 100);
                      return (
                      <li key={deal.id}>
                        <button
                          type="button"
                          onClick={() => void openDeal(deal.id)}
                          className="flex w-full gap-3 overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300/70 hover:shadow-[0_12px_28px_-18px_rgba(16,185,129,0.45)] sm:p-3.5"
                        >
                          <div className="h-[4.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-xl bg-zinc-100 sm:h-24 sm:w-32">
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
                          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-zinc-900 sm:text-[15px]">
                              {deal.title}
                            </span>
                            <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                              {statusLabel(deal.status)}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-zinc-500">
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
                            <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                              <span>{p.current}</span>
                              <span className="tabular-nums">{pct}%</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] text-zinc-400">
                              {p.done}/{p.total} этапов
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

              {tab === "quotes" && (user.is_admin || user.is_manager) ? (
                <QuoteHistoryPanel scope="all" />
              ) : null}

              {tab === "manager" && (user.is_admin || user.is_manager) ? (
                <div className="space-y-6">
                  <AdminDealsPanel
                    canAssignRoles={user.is_admin}
                    currentUser={user}
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

              {tab === "logistics" && (user.is_admin || user.is_manager) ? (
                <LogisticsPanel />
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
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                ← Назад
              </button>
              <div className="mt-3 space-y-3">
                <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm">
                  <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />
                  <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        Сделка
                      </p>
                      <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-900">
                        {selected.title}
                      </h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        {[selected.lot_number && `Лот ${selected.lot_number}`, selected.vin]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {selected.manager_name || selected.manager_username ? (
                        <p className="mt-1.5 text-xs text-zinc-500">
                          Менеджер:{" "}
                          <span className="font-medium text-zinc-800">
                            {selected.manager_name ||
                              (selected.manager_username
                                ? `@${selected.manager_username}`
                                : "")}
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                      {statusLabel(selected.status)}
                    </span>
                  </div>
                  {selected.note ? (
                    <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600">
                      {selected.note}
                    </p>
                  ) : null}
                  <div className="mt-4 border-t border-zinc-100 pt-3">
                    <DealClosingStages deal={selected} />
                  </div>
                  </div>
                </div>

                <DealPhotos
                  deal={selected}
                  isAdmin={Boolean(user.is_admin || user.is_manager)}
                  onUpdated={(next) => {
                    setSelected(next);
                    setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                  }}
                />

                <DealPaymentStatus
                  deal={selected}
                  isAdmin={Boolean(user.is_admin || user.is_manager)}
                  onUpdated={(next) => {
                    setSelected(next);
                    setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                  }}
                />

                <DealRouteSections
                  deal={selected}
                  isAdmin={Boolean(user.is_admin || user.is_manager)}
                  onUpdated={(next) => {
                    setSelected(next);
                    setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                  }}
                />

                <DealDismantleMap
                  deal={selected}
                  isManager={Boolean(user.is_admin || user.is_manager)}
                />
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
