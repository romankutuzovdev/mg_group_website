"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isTelegramWebAppEnv } from "@/lib/telegram-webapp-auth";

const STORAGE_KEY = "mg_cookie_consent_v1";

function isTelegramMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (isTelegramWebAppEnv() || window.Telegram?.WebApp?.initData) return true;
  } catch {
    /* ignore */
  }
  return document.documentElement.classList.contains("tg-miniapp");
}

/** Баннер согласия на cookies (Закон РБ о персональных данных / UX). */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isTelegramMiniApp()) return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "accepted") return;
    } catch {
      /* private mode — всё равно покажем баннер */
    }
    setVisible(true);
  }, []);

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Согласие на использование cookies"
      className={cn(
        "fixed inset-x-0 z-[110] px-3",
        // Над нижней навигацией на мобиле
        "bottom-[calc(3.75rem+env(safe-area-inset-bottom))] lg:bottom-4",
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.14)] sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-700">
          Мы используем cookies и похожие технологии, чтобы сайт работал стабильно,
          сохранял вход в кабинет и улучшал удобство. Продолжая пользоваться сайтом,
          вы подтверждаете согласие.{" "}
          <Link
            href="/cookies/"
            className="font-medium text-[#1B5E20] underline underline-offset-2 hover:text-[#145218]"
          >
            Политика cookies
          </Link>
        </p>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 rounded-xl bg-[#1B5E20] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#145218] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B5E20]/40"
        >
          Принимаю
        </button>
      </div>
    </div>
  );
}
