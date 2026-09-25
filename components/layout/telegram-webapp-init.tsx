"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        enableClosingConfirmation?: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        themeParams?: Record<string, string>;
      };
    };
  }
}

/** Подключает Telegram WebApp API и помечает html классом tg-miniapp. */
export function TelegramWebAppInit() {
  useEffect(() => {
    const mark = () => {
      const wa = window.Telegram?.WebApp;
      if (!wa) return;
      document.documentElement.classList.add("tg-miniapp");
      try {
        wa.ready();
        wa.expand();
        wa.setHeaderColor?.("#ffffff");
        wa.setBackgroundColor?.("#f2f2f2");
      } catch {
        /* ignore */
      }
    };

    if (window.Telegram?.WebApp) {
      mark();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = mark;
    document.head.appendChild(script);
  }, []);

  return null;
}
