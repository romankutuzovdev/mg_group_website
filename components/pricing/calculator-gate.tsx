"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  fetchMe,
  getCabinetToken,
  loginWithPassword,
  setCabinetToken,
} from "@/lib/api/cabinet";
import { ApiError } from "@/lib/api/client";
import { CarSearchPanel } from "@/components/pricing/car-search-panel";

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

export function CalculatorGate({
  children,
  showOverview = false,
}: {
  children: React.ReactNode;
  /** После входа показать список доступных калькуляторов */
  showOverview?: boolean;
}) {
  const [status, setStatus] = useState<Status>("guest");
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus("loading");
    try {
      await loginWithPassword(login.trim(), password);
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
      <div className="mx-auto max-w-md py-4 text-center">
        <p className="text-sm text-text-muted">Проверяем вход…</p>
      </div>
    );
  }

  if (status === "guest") {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-white p-5 text-center sm:p-6">
        <h2 className="text-lg font-semibold text-text-primary">
          Калькуляторы доступны только авторизованным пользователям
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Войдите логином и паролем (клиентский телефон или админ с сервера), чтобы считать
          машинокомплект, авто под восстановление и растаможку.
        </p>
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3 text-left">
          <label className="block text-sm">
            <span className="text-text-muted">Логин</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Пароль</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>
        <p className="mt-3 text-xs text-text-muted">
          Нет аккаунта?{" "}
          <Link href="/cabinet/" className="font-semibold text-emerald-800 underline underline-offset-2">
            Личный кабинет
          </Link>
          {" · "}
          <Link href="/admin/" className="font-semibold underline underline-offset-2">
            Админ
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showOverview ? (
        <p className="rounded-lg border border-border bg-white px-4 py-3 text-sm text-text-secondary">
          Здесь есть калькулятор для машинокомплекта (США и Англия), авто под восстановление и растаможка.
        </p>
      ) : null}
      {children}
      <CarSearchPanel />
    </div>
  );
}
