/**
 * Helpers for Telegram Mini App (WebApp) silent auth.
 */

import { isApiEnabled } from "@/lib/api/config";
import {
  getCabinetToken,
  loginWithTelegramWebApp,
} from "@/lib/api/cabinet";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: { id?: number };
          auth_date?: number;
        };
        ready: () => void;
        expand: () => void;
        enableClosingConfirmation?: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        themeParams?: Record<string, string>;
        version?: string;
        isVersionAtLeast?: (version: string) => boolean;
        platform?: string;
      };
    };
  }
}

const SCRIPT_SRC = "https://telegram.org/js/telegram-web-app.js";

let scriptPromise: Promise<void> | null = null;
let authInFlight: Promise<boolean> | null = null;

export function isTelegramWebAppEnv(): boolean {
  if (typeof window === "undefined") return false;
  const wa = window.Telegram?.WebApp;
  if (wa?.initData && wa.initData.length > 0) return true;
  // Telegram injects tgWebAppData in hash/query before script loads
  try {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    return (
      hash.includes("tgWebAppData=") ||
      search.includes("tgWebAppData=") ||
      Boolean((window as unknown as { TelegramWebviewProxy?: unknown }).TelegramWebviewProxy)
    );
  } catch {
    return false;
  }
}

export function getTelegramWebAppInitData(): string {
  if (typeof window === "undefined") return "";
  return (window.Telegram?.WebApp?.initData || "").trim();
}

function loadTelegramWebAppScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Telegram?.WebApp) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      if (window.Telegram?.WebApp) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      // Fallback if already loaded
      setTimeout(() => resolve(), 800);
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function waitForInitData(timeoutMs = 2500): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = getTelegramWebAppInitData();
    if (data) return data;
    await new Promise((r) => setTimeout(r, 50));
  }
  return getTelegramWebAppInitData();
}

/**
 * If opened inside Telegram Mini App, exchange initData for JWT.
 * Returns true when a cabinet token is available afterwards.
 */
export async function ensureTelegramWebAppAuth(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isApiEnabled()) return Boolean(getCabinetToken());

  if (getCabinetToken()) return true;

  if (authInFlight) return authInFlight;

  authInFlight = (async () => {
    try {
      await loadTelegramWebAppScript();
      const wa = window.Telegram?.WebApp;
      try {
        wa?.ready();
        wa?.expand();
      } catch {
        /* ignore */
      }

      const initData = await waitForInitData();
      if (!initData) return false;

      await loginWithTelegramWebApp(initData);
      return true;
    } catch {
      return Boolean(getCabinetToken());
    } finally {
      authInFlight = null;
    }
  })();

  return authInFlight;
}
