"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";
import {
  fetchMe,
  getCabinetToken,
  loginWithPassword,
  setCabinetToken,
} from "@/lib/api/cabinet";
import { ApiError } from "@/lib/api/client";
import {
  CABINET_POLICY_PATH,
  acceptCabinetPolicyConsent,
} from "@/lib/cabinet-consent";
import { ConsentCheck } from "@/components/site/consent-check";
import type { CalculatorMode } from "@/components/pricing/site-calculator";
import { PasswordInput } from "@/components/site/password-input";

type Status = "loading" | "guest" | "user";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Calculators live in the cabinet; this is what a public /calculator/* page shows. */
export function CalculatorGate({ calc }: { calc?: CalculatorMode }) {
  const router = useRouter();
  const cabinetHref = `/cabinet/?tab=calculators${calc ? `&calc=${calc}` : ""}`;
  const [status, setStatus] = useState<Status>("guest");
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [consentService, setConsentService] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (getCabinetToken()) setStatus("loading");
    void (async () => {
      try {
        if (!getCabinetToken()) {
          if (!cancelled) setStatus("guest");
          return;
        }
        await withTimeout(fetchMe(), 8000);
        if (!cancelled) setStatus("user");
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 401) setCabinetToken(null);
          setStatus("guest");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === "user") void router.replace(cabinetHref);
    // router is not stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cabinetHref]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!policyAccepted) {
      setError("Отметьте согласие с политикой конфиденциальности");
      return;
    }
    if (!consentService) {
      setError("Нужно согласие на сервисные уведомления");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("loading");
    try {
      acceptCabinetPolicyConsent();
      await loginWithPassword(login.trim(), password, {
        consent_privacy: policyAccepted,
        consent_service: consentService,
      });
      setStatus("user");
      setPassword("");
    } catch (err) {
      setStatus("guest");
      setError(err instanceof Error ? err.message : "Неверный логин или пароль");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white px-6 py-10 text-center">
        <span className="mx-auto block h-8 w-8 animate-pulse rounded-full border-2 border-accent/25 border-t-accent" aria-hidden />
        <p className="mt-4 text-sm text-text-muted">Проверяем вход…</p>
      </div>
    );
  }

  if (status === "guest") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-stone-200 bg-white p-6 sm:p-9">
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-accent-dark">Защищённый расчёт</p>
        <h2 className="mx-auto mt-3 max-w-md text-center font-display text-2xl font-semibold tracking-[-0.03em] text-stone-950 sm:text-3xl">
          Калькуляторы доступны после авторизации
        </h2>
        <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-stone-500">
          Есть калькуляторы для авто, машинокомплекта и растаможки. Они доступны в личном кабинете после входа или регистрации.
        </p>
        <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4 text-left">
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Логин</span>
            <input
              className="mt-2 h-12 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 text-sm outline-none transition hover:border-stone-300 focus:border-accent-dark focus:bg-white focus:ring-2 focus:ring-accent/15"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Пароль</span>
            <PasswordInput
              wrapperClassName="mt-2"
              className="h-12 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 text-sm outline-none transition hover:border-stone-300 focus:border-accent-dark focus:bg-white focus:ring-2 focus:ring-accent/15"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <div className="space-y-2">
            <ConsentCheck
              checked={policyAccepted}
              required
              className="text-text-secondary"
              onCheckedChange={(next) => {
                setPolicyAccepted(next);
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
              </Link>
            </ConsentCheck>
            <ConsentCheck
              checked={consentService}
              required
              className="text-text-secondary"
              onCheckedChange={(next) => {
                setConsentService(next);
                setError(null);
              }}
            >
              Согласен(на) на сервисные уведомления (статус сделки, SMS о кабинете)
            </ConsentCheck>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !policyAccepted || !consentService}
          className="min-h-12 w-full cursor-pointer rounded-xl bg-accent-dark px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>
        <Link
          href={`${cabinetHref}&auth=register`}
          className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-950 transition hover:border-accent-dark hover:text-accent-dark"
        >
          Зарегистрироваться
        </Link>
      </div>
    );
  }

  return <p className="text-center text-sm text-text-muted">Открываем калькуляторы в кабинете…</p>;
}
