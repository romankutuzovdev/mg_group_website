"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Calculator,
  CarFront,
  ChevronRight,
  Heart,
  Route,
  ShieldCheck,
  Ship,
  Users,
} from "lucide-react";
import SEO from "@/components/SEO";
import { PasswordInput } from "@/components/site/password-input";
import { CabinetFrame, CabinetShell, type NavItem } from "@/components/cabinet/app-shell";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  KeyValue,
  LinkButton,
  Notice,
  PageHeader,
  Progress,
  Spinner,
  StatRow,
  StatTile,
  Table,
  Td,
  Th,
  dealStatusLabel,
  dealStatusTone,
  inputClass,
  labelClass,
} from "@/components/cabinet/ui";
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
import { QuoteHistoryPanel } from "@/components/cabinet/quote-history-panel";
import type { CalculatorMode } from "@/components/pricing/site-calculator";
import { DealCarStatus, DealCarStatusBadge } from "@/components/cabinet/deal-car-status";
import { DealClaims } from "@/components/cabinet/deal-claims";
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
  DEAL_KIND_LABELS,
  fetchFavorites,
  fetchMe,
  fetchMyDeal,
  fetchMyDeals,
  fetchAuthConfig,
  getCabinetToken,
  loginDev,
  loginWithPassword,
  regionLabel,
  registerConfirm,
  registerSendCode,
  setCabinetToken,
  dealKind,
  dealProgress,
} from "@/lib/api/cabinet";
import { ManagerClientsPanel } from "@/components/cabinet/manager-clients-panel";
import { hydrateFavorites, resetFavoritesCache, subscribeFavorites } from "@/lib/favorites-cache";
import {
  acceptCabinetPolicyConsent,
  CABINET_POLICY_PATH,
  hasCabinetPolicyConsent,
} from "@/lib/cabinet-consent";

type View = "list" | "detail";

const SiteCalculator = dynamic(
  () => import("@/components/pricing/site-calculator").then((m) => m.SiteCalculator),
  { ssr: false, loading: () => <p className="text-sm text-zinc-500">Загружаем калькулятор…</p> },
);

const CALCULATOR_MODES: CalculatorMode[] = ["kit-uk", "kit-usa", "car", "customs"];

function formatMoney(amount: number, currency: string) {
  const cur = currency === "GBP" ? "GBP" : "USD";
  return new Intl.NumberFormat(cur === "GBP" ? "en-GB" : "en-US", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

type Tab = "deals" | "favorites" | "calculators" | "quotes" | "manager" | "logistics" | "clients";

const TAB_IDS: Tab[] = ["deals", "favorites", "calculators", "quotes", "manager", "logistics", "clients"];

function tabFromQuery(raw: string | null): Tab | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "favorites" || v === "fav" || v === "избранное") return "favorites";
  if (v === "calculator" || v === "calc" || v === "калькулятор") return "calculators";
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
  const [storedTab, setTab] = useState<Tab>("deals");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devAuthEnabled, setDevAuthEnabled] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [calcMode, setCalcMode] = useState<CalculatorMode>("kit-uk");
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
    if (params.get("auth") === "register") setAuthMode("register");
    const calc = params.get("calc") as CalculatorMode | null;
    if (calc && CALCULATOR_MODES.includes(calc)) setCalcMode(calc);
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
  // Менеджер видит только своих клиентов: общие разделы ему закрыты.
  const isLimitedManager = Boolean(user?.is_manager && !user?.is_admin);
  const tab: Tab =
    isLimitedManager && !["favorites", "calculators", "manager"].includes(storedTab)
      ? "clients"
      : storedTab;
  const activeDeals = deals.filter((d) => d.status === "active").length;

  const navItems: NavItem[] = [
    isLimitedManager
      ? { id: "clients", label: "Мои клиенты", icon: Users }
      : { id: "deals", label: "Сделки", icon: BriefcaseBusiness, badge: deals.length || null },
    { id: "favorites", label: "Избранное", icon: Heart, badge: favorites.length || null },
    { id: "calculators", label: "Калькуляторы", icon: Calculator },
    // CRM у менеджера: сервер отдаёт только его клиентов и сделки.
    ...(isLimitedManager
      ? [{ id: "manager", label: "CRM · клиенты", icon: Users, section: "Команда" }]
      : []),
    ...(isStaff && !isLimitedManager
      ? [
          { id: "manager", label: "CRM · клиенты", icon: Users, section: "Команда" },
          { id: "logistics", label: "Логистика", icon: Ship, section: "Команда" },
          { id: "quotes", label: "Просчёты", icon: Calculator, section: "Команда" },
          ...(user?.is_admin
            ? [
                {
                  id: "managers",
                  label: "Менеджеры",
                  icon: ShieldCheck,
                  section: "Команда",
                  href: "/cabinet/managers/",
                },
              ]
            : []),
        ]
      : []),
  ];

  const backToList = () => {
    setView("list");
    setSelected(null);
    void loadFavorites();
  };

  const dealSub = (deal: Deal) =>
    [deal.lot_number && `Лот ${deal.lot_number}`, deal.vin].filter(Boolean).join(" · ");

  // ------------------------------------------------------------------ auth
  if (!user) {
    return (
      <CabinetFrame>
        <div className="grid min-h-[100dvh] lg:grid-cols-[1.05fr_1fr]">
          <aside className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-10 text-white lg:flex">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_-10%_-10%,rgba(16,185,129,0.22),transparent_60%),radial-gradient(600px_300px_at_110%_110%,rgba(16,185,129,0.12),transparent_60%)]" />
            <Link href="/" className="relative flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-[11px] font-bold text-zinc-950">
                MG
              </span>
              <span className="text-[13px] font-semibold tracking-wide">MG.GROUP</span>
            </Link>
            <div className="relative max-w-md">
              <h1 className="text-[40px] font-semibold leading-[1.08] tracking-tight">
                Каждая сделка
                <br />
                под контролем.
              </h1>
              <p className="mt-5 text-[15px] leading-7 text-zinc-400">
                Этапы, платежи, фото и маршрут автомобиля из США, Англии, Китая и Кореи в одном
                рабочем пространстве. Без звонков «а где сейчас машина».
              </p>
              <ul className="mt-9 space-y-4">
                {[
                  [Route, "Живой маршрут", "Статус каждого этапа от аукциона до выдачи"],
                  [CarFront, "Фото и документы", "Материалы появляются по мере движения сделки"],
                  [ShieldCheck, "Безопасный доступ", "Вход по телефону и паролю, данные под защитой"],
                ].map(([Icon, title, text]) => (
                  <li key={String(title)} className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-emerald-400">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-[14px] font-medium">{String(title)}</span>
                      <span className="block text-[13px] text-zinc-500">{String(text)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="relative text-xs text-zinc-500">MG.GROUP · Гродно · подбор и доставка авто</p>
          </aside>

          <div className="flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 lg:justify-end lg:px-8">
              <Link href="/" className="flex items-center gap-2.5 lg:hidden">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-[11px] font-bold text-white">
                  MG
                </span>
                <span className="text-[13px] font-semibold">MG.GROUP</span>
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-zinc-900"
              >
                На сайт <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:px-8">
              <div className="w-full max-w-[400px]">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  {authMode === "login" ? "Вход в кабинет" : "Регистрация"}
                </h2>
                <p className="mt-1.5 text-[13px] text-zinc-500">
                  {authMode === "login"
                    ? "Телефон и пароль, свой или полученный от менеджера."
                    : "Подтвердите телефон кодом из SMS и задайте пароль."}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1">
                  {(
                    [
                      ["login", "Вход"],
                      ["register", "Регистрация"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setAuthMode(mode);
                        setError(null);
                      }}
                      className={`rounded-[5px] px-3 py-1.5 text-[13px] font-medium transition ${
                        authMode === mode
                          ? "bg-white text-zinc-900 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-800"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {error ? (
                  <Notice tone="danger" className="mt-4">
                    {error}
                  </Notice>
                ) : null}

                {loading ? (
                  <div className="mt-6 flex items-center gap-2 text-[13px] text-zinc-500">
                    <Spinner /> Проверяем доступ…
                  </div>
                ) : null}

                {authMode === "login" ? (
                  <form onSubmit={(e) => void loginByPhone(e)} className="mt-5 space-y-4">
                    <label className={labelClass}>
                      Логин
                      <input
                        className={`${inputClass} mt-1.5`}
                        value={phoneLogin}
                        onChange={(e) => setPhoneLogin(e.target.value)}
                        placeholder="Телефон или логин"
                        autoComplete="username"
                        inputMode="tel"
                        required
                      />
                    </label>
                    <label className={labelClass}>
                      Пароль
                      <PasswordInput
                        wrapperClassName="mt-1.5"
                        className={inputClass}
                        value={phonePassword}
                        onChange={(e) => setPhonePassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <div className="space-y-2.5 pt-1">
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
                          className="font-medium text-emerald-700 underline underline-offset-2"
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
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={phoneBusy || !policyAccepted || !consentService}
                      className="h-10 w-full text-sm"
                    >
                      {phoneBusy ? "Входим…" : "Войти"}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={(e) => void registerBySms(e)} className="mt-5 space-y-4">
                    <label className={labelClass}>
                      Телефон
                      <div className="mt-1.5 flex gap-2">
                        <input
                          className={inputClass}
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                          placeholder="+375 29 123-45-67"
                          autoComplete="tel"
                          inputMode="tel"
                          required
                        />
                        <Button
                          type="button"
                          disabled={phoneBusy || !regPhone.trim()}
                          onClick={() => void sendRegisterCode()}
                        >
                          {regCodeSent ? "Ещё раз" : "Код"}
                        </Button>
                      </div>
                    </label>
                    {regHint ? <Notice tone="info">{regHint}</Notice> : null}
                    <div className="grid grid-cols-[1fr_1.4fr] gap-3">
                      <label className={labelClass}>
                        Код из SMS
                        <input
                          className={`${inputClass} mt-1.5 font-mono`}
                          value={regCode}
                          onChange={(e) => setRegCode(e.target.value)}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          required
                        />
                      </label>
                      <label className={labelClass}>
                        Имя
                        <input
                          className={`${inputClass} mt-1.5`}
                          value={regFirstName}
                          onChange={(e) => setRegFirstName(e.target.value)}
                          placeholder="Как к вам обращаться"
                          autoComplete="given-name"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={labelClass}>
                        Пароль
                        <PasswordInput
                          wrapperClassName="mt-1.5"
                          className={inputClass}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          autoComplete="new-password"
                          required
                          minLength={4}
                        />
                      </label>
                      <label className={labelClass}>
                        Повтор пароля
                        <PasswordInput
                          wrapperClassName="mt-1.5"
                          className={inputClass}
                          value={regPassword2}
                          onChange={(e) => setRegPassword2(e.target.value)}
                          autoComplete="new-password"
                          required
                          minLength={4}
                        />
                      </label>
                    </div>
                    <div className="space-y-2.5 pt-1">
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
                          className="font-medium text-emerald-700 underline underline-offset-2"
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
                      <ConsentCheck checked={consentMarketing} onCheckedChange={setConsentMarketing}>
                        Согласен(на) на рекламную и информационную рассылку MG.GROUP
                      </ConsentCheck>
                    </div>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={phoneBusy || !policyAccepted || !consentService}
                      className="h-10 w-full text-sm"
                    >
                      {phoneBusy ? "Создаём…" : "Зарегистрироваться"}
                    </Button>
                  </form>
                )}

                {devAuthEnabled ? (
                  <div className="mt-5 rounded-md border border-dashed border-amber-300 bg-amber-50/60 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800">
                      Локальный тест
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(
                        [
                          ["manager", "Войти как менеджер"],
                          ["client", "Войти как клиент"],
                        ] as const
                      ).map(([role, label]) => (
                        <Button
                          key={role}
                          size="sm"
                          variant={role === "manager" ? "dark" : "secondary"}
                          disabled={phoneBusy || !policyAccepted}
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
                                const res = await loginDev(role);
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
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="mt-6 text-center text-[13px] text-zinc-500">
                  Нет доступа?{" "}
                  <a
                    href={dictionary.global.tgLink}
                    className="font-medium text-zinc-900 underline underline-offset-2"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Написать менеджеру
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </CabinetFrame>
    );
  }

  // ------------------------------------------------------------------ app
  return (
    <CabinetShell
      user={user}
      items={navItems}
      activeId={tab}
      onSelect={(id) => selectTab(id as Tab)}
      onLogout={logout}
      workspaceLabel={isStaff ? "Рабочее пространство" : "Личный кабинет"}
      topbarActions={
        loading ? (
          <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
            <Spinner /> Загрузка
          </span>
        ) : null
      }
    >
      {error ? (
        <Notice
          tone="danger"
          className="mb-4"
          action={
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-medium underline underline-offset-2"
            >
              Скрыть
            </button>
          }
        >
          {error}
        </Notice>
      ) : null}

      {view === "detail" && selected ? (
        <div className="space-y-5">
          <button
            type="button"
            onClick={backToList}
            className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition hover:text-zinc-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {isLimitedManager ? "Мои клиенты" : "Все сделки"}
          </button>
          <PageHeader
            breadcrumb={`Сделка #${selected.id}`}
            title={selected.title}
            description={dealSub(selected) || "Без VIN и номера лота"}
            actions={
              <Badge tone={dealStatusTone(selected.status)} dot className="px-2.5 py-1 text-xs">
                {dealStatusLabel(selected.status)}
              </Badge>
            }
          />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-5">
              {selected.note ? <Notice>{selected.note}</Notice> : null}

              <DealPhotos
                deal={selected}
                isAdmin={isStaff}
                onUpdated={(next) => {
                  setSelected(next);
                  setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                }}
              />

              <DealPaymentStatus
                deal={selected}
                isAdmin={isStaff && !isLimitedManager}
                onUpdated={(next) => {
                  setSelected(next);
                  setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                }}
              />

              <DealTrackingLink
                deal={selected}
                isManager={isStaff}
                onUpdated={(next) => {
                  setSelected(next);
                  setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                }}
              />

              <DealDismantlePhotosLink
                deal={selected}
                isManager={isStaff}
                onUpdated={(next) => {
                  setSelected(next);
                  setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                }}
              />

              <DealClaims
                deal={selected}
                isManager={isStaff}
                onUpdated={(next) => {
                  setSelected(next);
                  setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                }}
              />

              {/* Авто под постановку на учёт: клиенту только трекер; этапы/карта — менеджеру или для комплектов */}
              {dealKind(selected) === "kit" || isStaff ? (
                <DealRouteSections
                  deal={selected}
                  isAdmin={isStaff}
                  canEditRoute={!isLimitedManager}
                  onUpdated={(next) => {
                    setSelected(next);
                    setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                  }}
                />
              ) : null}

              {dealKind(selected) === "kit" ? (
                <DealDismantleMap deal={selected} isManager={isStaff} />
              ) : null}
            </div>

            <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
              <Card>
                <CardHeader title="Сводка" />
                <CardBody className="py-2">
                  <KeyValue
                    rows={[
                      {
                        label: "Статус",
                        value: (
                          <Badge tone={dealStatusTone(selected.status)} dot>
                            {dealStatusLabel(selected.status)}
                          </Badge>
                        ),
                      },
                      {
                        label: "Где машина",
                        value: (
                          <DealCarStatus
                            deal={selected}
                            isManager={isStaff}
                            onUpdated={(next) => {
                              setSelected(next);
                              setDeals((prev) => prev.map((d) => (d.id === next.id ? next : d)));
                            }}
                          />
                        ),
                      },
                      { label: "Тип", value: DEAL_KIND_LABELS[dealKind(selected)] },
                      { label: "Откуда", value: regionLabel(selected.origin_region || "usa") },
                      ...(selected.lot_number
                        ? [{ label: "Лот", value: `#${selected.lot_number}` }]
                        : []),
                      ...(selected.vin
                        ? [{ label: "VIN", value: <span className="font-mono text-xs">{selected.vin}</span> }]
                        : []),
                      ...(selected.price
                        ? [{ label: "Цена", value: formatMoney(selected.price, selected.currency || "USD") }]
                        : []),
                      { label: "Оплата", value: paymentProgressLabel(selected) || "ожидает оплаты" },
                      ...(selected.manager_name || selected.manager_username
                        ? [
                            {
                              label: "Менеджер",
                              value:
                                selected.manager_name ||
                                (selected.manager_username ? `@${selected.manager_username}` : ""),
                            },
                          ]
                        : []),
                    ]}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader
                  title="Этапы закрытия"
                  description={`${dealProgress(selected).done} из ${dealProgress(selected).total} пройдено`}
                />
                <CardBody className="pt-3">
                  <Progress
                    value={(dealProgress(selected).done / Math.max(dealProgress(selected).total, 1)) * 100}
                    className="mb-3"
                  />
                  <DealClosingStages deal={selected} bare />
                </CardBody>
              </Card>
              <DealSpecsGrid specs={selected.specs} />
            </aside>
          </div>
        </div>
      ) : null}

      {view === "list" && tab === "deals" ? (
        <div className="space-y-5">
          <PageHeader
            title="Сделки"
            description={
              isStaff
                ? "Сделки, где вы выступаете клиентом. Сделки клиентов ведутся в разделе CRM."
                : "Путь каждого автомобиля: этапы, платежи, фото и логистика."
            }
            actions={
              <LinkButton href="/auctions/" variant="secondary">
                Каталог аукционов
              </LinkButton>
            }
          />
          {!isStaff ? (
            <StatRow className="md:grid-cols-3">
              <StatTile
                label="Все сделки"
                value={deals.length}
                icon={<BriefcaseBusiness className="h-4 w-4" />}
              />
              <StatTile label="Сейчас в пути" value={activeDeals} icon={<Route className="h-4 w-4" />} />
              <StatTile label="В избранном" value={favorites.length} icon={<Heart className="h-4 w-4" />} />
            </StatRow>
          ) : null}

          {deals.length === 0 ? (
            <EmptyState
              icon={<BriefcaseBusiness className="h-4 w-4" />}
              title="Пока нет сделок"
              description="Сделку создаёт менеджер. Как только автомобиль будет оформлен, он появится здесь со всеми этапами."
              action={
                <a
                  href={dictionary.global.tgLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium text-emerald-700 underline underline-offset-2"
                >
                  Написать менеджеру
                </a>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <thead>
                    <tr>
                      <Th>Автомобиль</Th>
                      <Th>Тип</Th>
                      <Th>Оплата</Th>
                      <Th className="w-[200px]">Прогресс</Th>
                      <Th>Статус</Th>
                      <Th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((deal) => {
                      const p = dealProgress(deal);
                      const pct = Math.round((p.done / Math.max(p.total, 1)) * 100);
                      return (
                        <tr
                          key={deal.id}
                          onClick={() => void openDeal(deal.id)}
                          className="cursor-pointer transition hover:bg-zinc-50"
                        >
                          <Td>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-zinc-100 ring-1 ring-zinc-200">
                                <CoverThumb
                                  src={dealCoverPhotoUrl(deal)}
                                  className="h-full w-full object-cover"
                                  fallback={
                                    <div className="flex h-full w-full items-center justify-center text-zinc-300">
                                      <CarFront className="h-4 w-4" />
                                    </div>
                                  }
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-zinc-900">{deal.title}</p>
                                <p className="truncate text-xs text-zinc-500">
                                  {dealSub(deal) || "Без VIN / лота"}
                                </p>
                              </div>
                            </div>
                          </Td>
                          <Td>
                            <p className="text-zinc-900">{DEAL_KIND_LABELS[dealKind(deal)]}</p>
                            <p className="text-xs text-zinc-500">{regionLabel(deal.origin_region || "usa")}</p>
                          </Td>
                          <Td>
                            <p className="text-zinc-900">
                              {paymentProgressLabel(deal) || "ожидает оплаты"}
                            </p>
                            {deal.price ? (
                              <p className="text-xs tabular-nums text-zinc-500">
                                {formatMoney(deal.price, deal.currency || "USD")}
                              </p>
                            ) : null}
                          </Td>
                          <Td>
                            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                              <span className="truncate">{p.current}</span>
                              <span className="tabular-nums">{pct}%</span>
                            </div>
                            <Progress value={pct} className="mt-1.5" />
                          </Td>
                          <Td>
                            <Badge tone={dealStatusTone(deal.status)} dot>
                              {dealStatusLabel(deal.status)}
                            </Badge>
                            <DealCarStatusBadge deal={deal} />
                          </Td>
                          <Td className="text-zinc-300">
                            <ChevronRight className="h-4 w-4" />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
              {/* Mobile cards */}
              <ul className="divide-y divide-zinc-100 md:hidden">
                {deals.map((deal) => {
                  const p = dealProgress(deal);
                  const pct = Math.round((p.done / Math.max(p.total, 1)) * 100);
                  return (
                    <li key={deal.id}>
                      <button
                        type="button"
                        onClick={() => void openDeal(deal.id)}
                        className="flex w-full gap-3 p-4 text-left transition active:bg-zinc-50"
                      >
                        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-100 ring-1 ring-zinc-200">
                          <CoverThumb
                            src={dealCoverPhotoUrl(deal)}
                            className="h-full w-full object-cover"
                            fallback={
                              <div className="flex h-full w-full items-center justify-center text-zinc-300">
                                <CarFront className="h-5 w-5" />
                              </div>
                            }
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium text-zinc-900">{deal.title}</p>
                            <Badge tone={dealStatusTone(deal.status)} dot>
                              {dealStatusLabel(deal.status)}
                            </Badge>
                            <DealCarStatusBadge deal={deal} />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {[
                              DEAL_KIND_LABELS[dealKind(deal)],
                              regionLabel(deal.origin_region || "usa"),
                              paymentProgressLabel(deal) || "ожидает оплаты",
                            ].join(" · ")}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                            <span className="truncate">{p.current}</span>
                            <span className="tabular-nums">{pct}%</span>
                          </div>
                          <Progress value={pct} className="mt-1" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      ) : null}

      {view === "list" && tab === "favorites" ? (
        <div className="space-y-5">
          <PageHeader
            title="Избранное"
            description="Лоты, за которыми вы следите. Добавляйте их сердечком на карточках аукциона."
            actions={
              <LinkButton href="/auctions/" variant="secondary">
                К аукционам
              </LinkButton>
            }
          />
          {favorites.length === 0 ? (
            <EmptyState
              icon={<Heart className="h-4 w-4" />}
              title="В избранном пусто"
              description="Откройте каталог и отметьте интересные лоты, они появятся здесь."
              action={
                <LinkButton href="/auctions/" variant="primary">
                  Открыть каталог
                </LinkButton>
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {favorites.map((fav) => (
                <li key={fav.lot_id}>
                  <Card className="relative overflow-hidden">
                    <Link href={`/auctions/${fav.slug}/`} className="block">
                      <div className="aspect-[16/10] w-full bg-zinc-100">
                        {fav.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fav.image_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="p-4">
                        <p className="truncate text-sm font-medium text-zinc-900">{fav.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          <span className="font-medium tabular-nums text-zinc-900">
                            {formatMoney(fav.current_bid, fav.currency)}
                          </span>
                          {fav.source ? ` · ${fav.source}` : ""}
                          {fav.auction_date
                            ? ` · ${new Date(fav.auction_date).toLocaleString("ru-RU", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : ""}
                        </p>
                      </div>
                    </Link>
                    <div className="absolute right-3 top-3">
                      <FavoriteButton
                        lotId={fav.lot_id}
                        className="!border-zinc-200 !bg-white !text-rose-500 hover:!bg-zinc-50"
                      />
                    </div>
                    <div className="border-t border-zinc-100 px-4 py-3">
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
                        className="text-[13px] font-medium text-emerald-700 underline-offset-2 hover:underline"
                      >
                        Заказать Carfax
                      </a>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {view === "list" && tab === "calculators" ? (
        <div className="space-y-6">
          <PageHeader
            title="Калькуляторы"
            description="Машинокомплект из Англии и США, авто под восстановление и растаможка."
          />
          <SiteCalculator key={calcMode} mode={calcMode} />
          <QuoteHistoryPanel scope="mine" />
        </div>
      ) : null}

      {view === "list" && tab === "quotes" && isStaff ? (
        <div className="space-y-5">
          <PageHeader
            title="Просчёты"
            description="История расчётов клиентов в калькуляторах. Каждый просчёт также приходит в Telegram."
          />
          <QuoteHistoryPanel scope="all" />
        </div>
      ) : null}

      {view === "list" && tab === "clients" && isLimitedManager ? (
        <ManagerClientsPanel manager={user} onOpenDeal={(id) => void openDeal(id)} />
      ) : null}

      {view === "list" && tab === "manager" && isStaff ? (
        <div className="space-y-8">
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
        </div>
      ) : null}

      {view === "list" && tab === "logistics" && isStaff ? <LogisticsPanel /> : null}
    </CabinetShell>
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
