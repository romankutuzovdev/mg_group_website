"use client";

import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CarFront,
  Heart,
  LogOut,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { DealRouteSections } from "@/components/cabinet/deal-route-sections";
import { DealDismantleMap } from "@/components/cabinet/deal-dismantle-map";
import { DealTrackingLink } from "@/components/cabinet/deal-tracking-link";
import { DealDismantlePhotosLink } from "@/components/cabinet/deal-dismantle-photos-link";
import { CoverThumb, DealPhotos, dealCoverPhotoUrl } from "@/components/cabinet/deal-photos";
import { DealPaymentStatus, paymentProgressLabel } from "@/components/cabinet/deal-payment-status";
import { DealClosingStages } from "@/components/cabinet/deal-closing-stages";
import { DealSpecsGrid } from "@/components/cabinet/deal-specs";
import { AdminDealsPanel } from "@/components/cabinet/admin-deals-panel";
import { LogisticsPanel } from "@/components/cabinet/logistics-panel";
import { PurchasedCarsAdmin } from "@/components/cabinet/purchased-cars-admin";
import { QuoteHistoryPanel } from "@/components/cabinet/quote-history-panel";
import { FavoriteButton } from "@/components/auctions/favorite-button";
import { ConsentCheck } from "@/components/site/consent-check";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { consultationMessage } from "@/lib/company";
import { isApiEnabled } from "@/lib/api/config";
import {
  type CabinetUser,
  type Deal,
  type FavoriteLot,
  fetchFavorites,
  fetchMe,
  fetchMyDeal,
  fetchMyDeals,
  fetchAuthConfig,
  getCabinetToken,
  loginDev,
  loginWithPassword,
  registerConfirm,
  registerSendCode,
  setCabinetToken,
  dealKind,
  stageKeysForDeal,
} from "@/lib/api/cabinet";
import { hydrateFavorites, resetFavoritesCache, subscribeFavorites } from "@/lib/favorites-cache";
import {
  acceptCabinetPolicyConsent,
  CABINET_POLICY_PATH,
  hasCabinetPolicyConsent,
} from "@/lib/cabinet-consent";

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
  const [devAuthEnabled, setDevAuthEnabled] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [phoneLogin, setPhoneLogin] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [regFirstName, setRegFirstName] = useState("");
  const [regCodeSent, setRegCodeSent] = useState(false);
  const [regHint, setRegHint] = useState<string | null>(null);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [consentService, setConsentService] = useState(true);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  useEffect(() => {
    setPolicyAccepted(hasCabinetPolicyConsent());
  }, []);

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
        setError("API недоступен. Проверьте, что бэкенд запущен.");
        return;
      }
      try {
        const cfg = await fetchAuthConfig();
        setDevAuthEnabled(Boolean(cfg.dev_enabled));
      } catch {
        setDevAuthEnabled(false);
      }

      if (!hasCabinetPolicyConsent()) {
        setUser(null);
        return;
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
    if (!policyAccepted) {
      setError("Отметьте согласие с политикой конфиденциальности");
      return;
    }
    if (!consentService) {
      setError("Нужно согласие на сервисные уведомления");
      return;
    }
    if (!phoneLogin.trim() || !phonePassword) {
      setError("Введите логин и пароль");
      return;
    }
    setPhoneBusy(true);
    setError(null);
    try {
      acceptCabinetPolicyConsent();
      const res = await loginWithPassword(phoneLogin.trim(), phonePassword, {
        consent_privacy: policyAccepted,
        consent_service: consentService,
      });
      setUser(res.user);
      setPhonePassword("");
      await Promise.all([loadDeals(), loadFavorites()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неверный логин или пароль");
    } finally {
      setPhoneBusy(false);
    }
  };

  const sendRegisterCode = async () => {
    if (!regPhone.trim()) {
      setError("Укажите телефон");
      return;
    }
    setPhoneBusy(true);
    setError(null);
    setRegHint(null);
    try {
      const res = await registerSendCode(regPhone.trim());
      setRegCodeSent(true);
      if (res.debug_code) {
        setRegHint(`SMS не настроено на сервере. Код для теста: ${res.debug_code}`);
        setRegCode(res.debug_code);
      } else {
        setRegHint("Код отправлен в SMS. Действует 10 минут.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить код");
    } finally {
      setPhoneBusy(false);
    }
  };

  const registerBySms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyAccepted) {
      setError("Отметьте согласие с политикой конфиденциальности");
      return;
    }
    if (!consentService) {
      setError("Нужно согласие на сервисные уведомления");
      return;
    }
    if (!regPhone.trim() || !regCode.trim() || !regPassword) {
      setError("Заполните телефон, код из SMS и пароль");
      return;
    }
    if (regPassword.length < 4) {
      setError("Пароль минимум 4 символа");
      return;
    }
    if (regPassword !== regPassword2) {
      setError("Пароли не совпадают");
      return;
    }
    setPhoneBusy(true);
    setError(null);
    try {
      acceptCabinetPolicyConsent();
      const res = await registerConfirm({
        phone: regPhone.trim(),
        code: regCode.trim(),
        password: regPassword,
        first_name: regFirstName.trim(),
        consent_marketing: consentMarketing,
        consent_service: consentService,
        consent_privacy: policyAccepted,
      });
      setUser(res.user);
      setRegPassword("");
      setRegPassword2("");
      setRegCode("");
      await Promise.all([loadDeals(), loadFavorites()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось зарегистрироваться");
    } finally {
      setPhoneBusy(false);
    }
  };

  const isStaff = Boolean(user?.is_admin || user?.is_manager);
  const activeDeals = deals.filter((d) => d.status === "active").length;

  return (
    <PageShell bare className="!max-w-none !px-0 !pb-0">
      <header className="relative -mt-[calc(4.25rem+env(safe-area-inset-top,0px))] overflow-hidden bg-zinc-950 pt-[calc(4.25rem+env(safe-area-inset-top,0px))] text-white">
        <div className="absolute inset-0 bg-[url('/hero/mercedes-whole.jpg')] bg-cover bg-[center_58%] opacity-25" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,9,11,.98)_0%,rgba(9,9,11,.9)_45%,rgba(9,9,11,.25)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_260px_at_75%_110%,rgba(16,185,129,.22),transparent)]" />
        <div className="relative mx-auto flex min-h-[208px] max-w-7xl flex-col justify-between px-4 py-7 sm:min-h-[240px] sm:px-6 sm:py-9 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] backdrop-blur">MG</span>
              MG.GROUP
            </Link>
            <Link href="/" className="group inline-flex items-center gap-2 text-xs font-medium text-white/65 transition hover:text-white">
              На сайт <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="max-w-2xl pt-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-400">Private client space</p>
            <h1 className="mt-2 font-serif text-3xl tracking-[-0.03em] sm:text-5xl">
              {user ? `Добро пожаловать, ${user.first_name || "клиент"}` : "Ваш автомобиль — всегда на виду"}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 sm:text-base">
              {user ? "Сделки, документы и весь маршрут автомобиля в одном пространстве." : "Контролируйте сделку от покупки до выдачи: этапы, фото, платежи и логистика без лишних звонков."}
            </p>
          </div>
        </div>
      </header>

      <main className="bg-[#f4f2ed] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">

      {error ? (
        <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {!user ? (
        <div className="grid w-full gap-5 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,480px)] lg:gap-8">
          <aside className="relative hidden min-h-[620px] overflow-hidden rounded-[2rem] bg-zinc-900 p-8 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[url('/services/catalog-mercedes.jpg')] bg-cover bg-center opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-zinc-950/15" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur">
                <Sparkles className="h-3 w-3 text-emerald-400" /> Premium service
              </span>
            </div>
            <div className="relative max-w-lg">
              <h2 className="font-serif text-4xl leading-[1.05] tracking-[-0.03em]">Одна сделка.<br />Полная прозрачность.</h2>
              <div className="mt-7 grid gap-3">
                {[
                  [Route, "Живой маршрут", "Все этапы доставки и текущий статус"],
                  [CarFront, "Фото автомобиля", "Материалы по мере движения сделки"],
                  [ShieldCheck, "Безопасный доступ", "Персональные данные под защитой"],
                ].map(([Icon, title, text]) => (
                  <div key={String(title)} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-md">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950"><Icon className="h-5 w-5" /></span>
                    <span><b className="block text-sm">{String(title)}</b><span className="text-xs text-white/55">{String(text)}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
          <div className="w-full space-y-4">
            <div className="rounded-[2rem] border border-black/5 bg-white p-5 text-left shadow-[0_24px_70px_-40px_rgba(24,24,27,.35)] sm:p-8">
              <div className="mb-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Личный кабинет</p>
                <h2 className="mt-2 font-serif text-3xl tracking-tight text-zinc-950">Вход в пространство</h2>
                <p className="mt-2 text-sm text-zinc-500">Используйте телефон и пароль, полученный при регистрации.</p>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setError(null);
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    authMode === "login"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  Вход
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    setError(null);
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    authMode === "register"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  Регистрация
                </button>
              </div>

              {authMode === "login" ? (
                <form onSubmit={(e) => void loginByPhone(e)} className="mt-4">
                  <p className="text-sm font-semibold text-zinc-900">Логин и пароль</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Телефон и пароль (свой или от менеджера).
                  </p>
                  <label className="mt-5 block text-xs font-medium text-zinc-500">
                    Логин
                    <input
                      className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-3 text-sm outline-none ring-emerald-500/25 transition focus:bg-white focus:ring-2"
                      value={phoneLogin}
                      onChange={(e) => setPhoneLogin(e.target.value)}
                      placeholder="Телефон или логин"
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
                  <div className="mt-4 space-y-2.5">
                    <ConsentCheck
                      checked={policyAccepted}
                      required
                      onCheckedChange={(next) => {
                        setPolicyAccepted(next);
                        if (next) acceptCabinetPolicyConsent();
                        setError(null);
                      }}
                    >
                      Согласен(на) с{" "}
                      <Link
                        href={CABINET_POLICY_PATH}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-emerald-800 underline underline-offset-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        политикой конфиденциальности
                      </Link>{" "}
                      и обработкой персональных данных
                    </ConsentCheck>
                    <ConsentCheck
                      checked={consentService}
                      required
                      onCheckedChange={(next) => {
                        setConsentService(next);
                        setError(null);
                      }}
                    >
                      Согласен(на) на сервисные уведомления (статус сделки, SMS о кабинете)
                    </ConsentCheck>
                  </div>
                  <button
                    type="submit"
                    disabled={phoneBusy || !policyAccepted || !consentService}
                    className="mt-5 w-full rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {phoneBusy ? "Входим…" : "Войти"}
                  </button>
                </form>
              ) : (
                <form onSubmit={(e) => void registerBySms(e)} className="mt-4">
                  <p className="text-sm font-semibold text-zinc-900">Регистрация по SMS</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    На телефон придёт код подтверждения. Затем задайте пароль для входа.
                  </p>
                  <label className="mt-5 block text-xs font-medium text-zinc-500">
                    Телефон
                    <input
                      className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-3 text-sm outline-none ring-emerald-500/25 transition focus:bg-white focus:ring-2"
                      value={regPhone}
                      onChange={(e) => {
                        setRegPhone(e.target.value);
                        setRegCodeSent(false);
                      }}
                      placeholder="+375 XX XXX-XX-XX"
                      autoComplete="tel"
                      required
                    />
                  </label>
                  <label className="mt-3 block text-xs font-medium text-zinc-500">
                    Имя (необязательно)
                    <input
                      className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-3 text-sm outline-none ring-emerald-500/25 transition focus:bg-white focus:ring-2"
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      autoComplete="given-name"
                    />
                  </label>
                  <div className="mt-3 flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs font-medium text-zinc-500">
                      Код из SMS
                      <input
                        className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none ring-emerald-500/25 transition focus:bg-white focus:ring-2"
                        value={regCode}
                        onChange={(e) => setRegCode(e.target.value)}
                        placeholder="6 цифр"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                      />
                    </label>
                    <button
                      type="button"
                      disabled={phoneBusy || !regPhone.trim()}
                      onClick={() => void sendRegisterCode()}
                      className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2 py-2.5 text-[10px] font-semibold leading-none text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 sm:px-2.5 sm:text-[11px]"
                    >
                      {regCodeSent ? "Ещё раз" : "Код"}
                    </button>
                  </div>
                  {regHint ? (
                    <p className="mt-2 text-xs text-emerald-800">{regHint}</p>
                  ) : null}
                  <label className="mt-3 block text-xs font-medium text-zinc-500">
                    Пароль
                    <input
                      type="password"
                      className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-3 text-sm outline-none ring-emerald-500/25 transition focus:bg-white focus:ring-2"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={4}
                    />
                  </label>
                  <label className="mt-3 block text-xs font-medium text-zinc-500">
                    Повтор пароля
                    <input
                      type="password"
                      className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-3 text-sm outline-none ring-emerald-500/25 transition focus:bg-white focus:ring-2"
                      value={regPassword2}
                      onChange={(e) => setRegPassword2(e.target.value)}
                      autoComplete="new-password"
                      required
                      minLength={4}
                    />
                  </label>
                  <div className="mt-4 space-y-2.5">
                    <ConsentCheck
                      checked={policyAccepted}
                      required
                      onCheckedChange={(next) => {
                        setPolicyAccepted(next);
                        if (next) acceptCabinetPolicyConsent();
                        setError(null);
                      }}
                    >
                      Согласен(на) с{" "}
                      <Link
                        href={CABINET_POLICY_PATH}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-emerald-800 underline underline-offset-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        политикой конфиденциальности
                      </Link>{" "}
                      и обработкой персональных данных
                    </ConsentCheck>
                    <ConsentCheck
                      checked={consentService}
                      required
                      onCheckedChange={(next) => {
                        setConsentService(next);
                        setError(null);
                      }}
                    >
                      Согласен(на) на сервисные уведомления (статус сделки, SMS о кабинете)
                    </ConsentCheck>
                    <ConsentCheck
                      checked={consentMarketing}
                      onCheckedChange={setConsentMarketing}
                    >
                      Согласен(на) на рекламную и информационную рассылку MG.GROUP
                    </ConsentCheck>
                  </div>
                  <button
                    type="submit"
                    disabled={phoneBusy || !policyAccepted || !consentService}
                    className="mt-5 w-full rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {phoneBusy ? "Создаём…" : "Зарегистрироваться"}
                  </button>
                </form>
              )}
            </div>

            {devAuthEnabled ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-center">
                <p className="text-xs font-semibold text-amber-900">Локальный тест</p>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    disabled={phoneBusy || !policyAccepted}
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => {
                      void (async () => {
                        if (!policyAccepted) {
                          setError("Отметьте согласие с политикой конфиденциальности");
                          return;
                        }
                        setPhoneBusy(true);
                        setError(null);
                        try {
                          acceptCabinetPolicyConsent();
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
                    disabled={phoneBusy || !policyAccepted}
                    className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 disabled:opacity-50"
                    onClick={() => {
                      void (async () => {
                        if (!policyAccepted) {
                          setError("Отметьте согласие с политикой конфиденциальности");
                          return;
                        }
                        setPhoneBusy(true);
                        setError(null);
                        try {
                          acceptCabinetPolicyConsent();
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

            <p className="text-center text-xs text-zinc-500">
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
      ) : (
        <div className="flex w-full flex-1 flex-col space-y-5 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_20px_55px_-40px_rgba(24,24,27,.4)] sm:p-5">
            <div className="flex items-center gap-3">
              {user.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photo_url}
                  alt=""
                  className="h-11 w-11 rounded-xl object-cover ring-1 ring-zinc-200"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-bold text-white shadow-sm ring-4 ring-emerald-50">
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
            <div className="flex flex-wrap items-center gap-2">
              {user.is_admin ? (
                <Link
                  href="/cabinet/managers/"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                >
                  Менеджеры
                </Link>
              ) : null}
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                <LogOut className="h-3.5 w-3.5" /> Выйти
              </button>
            </div>
          </div>

          {!isStaff && view === "list" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: "Все сделки", value: deals.length, icon: BriefcaseBusiness },
                { label: "Сейчас в пути", value: activeDeals, icon: Route },
                { label: "В избранном", value: favorites.length, icon: Heart },
              ].map((s) => (
                <div
                  key={s.label}
                  className="group rounded-[1.5rem] border border-black/5 bg-white p-4 shadow-[0_18px_50px_-40px_rgba(24,24,27,.45)] transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{s.label}</p><p className="mt-2 font-serif text-3xl tabular-nums text-zinc-950">{s.value}</p></div>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-600 group-hover:text-white"><s.icon className="h-4 w-4" /></span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {view === "list" ? (
            <div className="space-y-5">
              <div className="flex gap-1 overflow-x-auto rounded-2xl border border-black/5 bg-white p-1.5 shadow-sm">
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
                    className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                      tab === t.id
                        ? "bg-zinc-950 text-white shadow-sm"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "favorites" ? (
              <div className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-[0_20px_60px_-45px_rgba(24,24,27,.45)] sm:p-7">
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
                          className="group flex w-full gap-4 overflow-hidden rounded-[1.5rem] border border-black/5 bg-white p-3 text-left shadow-[0_18px_50px_-42px_rgba(24,24,27,.5)] transition hover:-translate-y-0.5 hover:border-emerald-300/70 hover:shadow-xl sm:p-4"
                        >
                          <div className="h-[5rem] w-[6rem] shrink-0 overflow-hidden rounded-2xl bg-zinc-100 sm:h-28 sm:w-40">
                            <CoverThumb
                              src={cover}
                              className="h-full w-full object-cover"
                              fallback={
                                <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                                  Нет фото
                                </div>
                              }
                            />
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
                                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
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
                  {user.is_admin ? (
                    <div className="border-t border-border pt-5">
                      <h2 className="text-sm font-semibold">Купленные авто (витрина)</h2>
                      <p className="mt-0.5 mb-3 text-xs text-text-muted">
                        Добавление машин на публичную витрину купленных.
                      </p>
                      <PurchasedCarsAdmin />
                    </div>
                  ) : null}
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
                  <DealSpecsGrid specs={selected.specs} className="mt-3" />
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

                <DealTrackingLink
                  deal={selected}
                  isManager={Boolean(user.is_admin || user.is_manager)}
                  onUpdated={(next) => {
                    setSelected(next);
                    setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                  }}
                />

                <DealDismantlePhotosLink
                  deal={selected}
                  isManager={Boolean(user.is_admin || user.is_manager)}
                  onUpdated={(next) => {
                    setSelected(next);
                    setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                  }}
                />

                {/* Авто под постановку: клиенту только трекер; этапы/карта — менеджеру или для комплектов */}
                {dealKind(selected) === "kit" ||
                user.is_admin ||
                user.is_manager ? (
                  <DealRouteSections
                    deal={selected}
                    isAdmin={Boolean(user.is_admin || user.is_manager)}
                    onUpdated={(next) => {
                      setSelected(next);
                      setDeals((prev) =>
                        prev.map((d) => (d.id === next.id ? next : d)),
                      );
                    }}
                  />
                ) : null}

                {dealKind(selected) === "kit" ? (
                  <DealDismantleMap
                    deal={selected}
                    isManager={Boolean(user.is_admin || user.is_manager)}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
      </div>
      </main>
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
