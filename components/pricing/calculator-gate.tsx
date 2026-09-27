"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchMe,
  fetchTelegramAuthConfig,
  getCabinetToken,
  loginWithTelegram,
  setCabinetToken,
  type TelegramLoginUser,
} from "@/lib/api/cabinet";
import { ensureTelegramWebAppAuth, isTelegramWebAppEnv } from "@/lib/telegram-webapp-auth";
import { ApiError } from "@/lib/api/client";

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
  const widgetRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("guest");
  const [botUsername, setBotUsername] = useState("");
  const [authEnabled, setAuthEnabled] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (getCabinetToken()) setStatus("loading");
    void (async () => {
      try {
        const cfg = await withTimeout(fetchTelegramAuthConfig(), 8000);
        if (cancelled) return;
        setAuthEnabled(Boolean(cfg.enabled));
        setBotUsername(cfg.bot_username || "");
        if (!getCabinetToken()) {
          const ok = await withTimeout(ensureTelegramWebAppAuth(), 8000).catch(() => false);
          if (cancelled || !ok) return;
        }
        await withTimeout(fetchMe(), 8000);
        if (!cancelled) setStatus("user");
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 401) setCabinetToken(null);
          setStatus("guest");
        }
      } finally {
        if (!cancelled) setConfigReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.onTelegramAuth = async (tgUser: TelegramLoginUser) => {
      setError(null);
      setStatus("loading");
      try {
        await loginWithTelegram(tgUser);
        setStatus("user");
      } catch (err) {
        setStatus("guest");
        setError(err instanceof Error ? err.message : "Ошибка входа через Telegram");
      }
    };
    return () => {
      delete window.onTelegramAuth;
    };
  }, []);

  useEffect(() => {
    if (status !== "guest" || !authEnabled || !botUsername || !widgetRef.current) return;
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
  }, [status, authEnabled, botUsername]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-md py-4 text-center">
        <p className="text-sm text-text-muted">Проверяем вход через Telegram…</p>
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
          Войдите через Telegram, чтобы считать машинокомплект, авто под восстановление и растаможку.
        </p>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div ref={widgetRef} className="mt-4 flex min-h-10 items-center justify-center" />
        {configReady && !authEnabled ? (
          <p className="mt-3 text-sm text-text-muted">Вход через Telegram сейчас недоступен.</p>
        ) : null}
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
    </div>
  );
}
