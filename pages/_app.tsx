import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { DisableStaticExportPrefetch } from "@/components/layout/disable-static-export-prefetch";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { CookieConsent } from "@/components/site/cookie-consent";
import { YandexMetrika } from "@/components/site/yandex-metrika";
import { getDictionary } from "@/lib/dictionary";
import "@/styles/globals.css";

// Cabinet / admin are an app, not a marketing page: own shell, no site chrome.
function isAppRoute(pathname: string): boolean {
  return pathname.startsWith("/cabinet") || pathname.startsWith("/admin");
}

export default function App({ Component, pageProps }: AppProps) {
  const dictionary = pageProps.dictionary || getDictionary();
  const router = useRouter();
  const appRoute = isAppRoute(router.pathname || "");

  if (appRoute) {
    return (
      <div className="app-shell font-sans text-base antialiased">
        <YandexMetrika />
        <DisableStaticExportPrefetch />
        <main className="app-main app-main--full">
          <Component {...pageProps} />
        </main>
        <CookieConsent />
      </div>
    );
  }

  return (
    <div className="app-shell font-sans text-base antialiased">
      <YandexMetrika />
      <DisableStaticExportPrefetch />
      <Header dictionary={dictionary} />
      <main className="app-main">
        <Component {...pageProps} />
      </main>
      <Footer dictionary={dictionary} />
      <MobileBottomNav />
      <CookieConsent />
    </div>
  );
}
