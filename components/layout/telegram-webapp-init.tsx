"use client";

import { useEffect } from "react";
import {
  ensureTelegramWebAppAuth,
  isTelegramWebAppEnv,
} from "@/lib/telegram-webapp-auth";

/** Подключает Telegram WebApp API, помечает html классом tg-miniapp и тихо логинит. */
export function TelegramWebAppInit() {
  useEffect(() => {
    const mark = () => {
      const wa = window.Telegram?.WebApp;
      if (!wa) return;
      document.documentElement.classList.add("tg-miniapp");
      try {
        wa.ready();
        wa.expand();
        if (wa.isVersionAtLeast?.("6.1")) {
          wa.setHeaderColor?.("#ffffff");
          wa.setBackgroundColor?.("#f2f2f2");
        }
      } catch {
        /* ignore */
      }
    };

    const boot = async () => {
      if (window.Telegram?.WebApp) {
        mark();
      } else if (isTelegramWebAppEnv()) {
        const script = document.createElement("script");
        script.src = "https://telegram.org/js/telegram-web-app.js";
        script.async = true;
        script.onload = mark;
        document.head.appendChild(script);
      }

      // Silent JWT login for Mini App — no Login Widget click required
      if (isTelegramWebAppEnv() || window.Telegram?.WebApp?.initData) {
        await ensureTelegramWebAppAuth();
      }
    };

    void boot();
  }, []);

  return null;
}
