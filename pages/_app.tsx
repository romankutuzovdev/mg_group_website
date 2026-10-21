import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { DisableStaticExportPrefetch } from "@/components/layout/disable-static-export-prefetch";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { CookieConsent } from "@/components/site/cookie-consent";
import { DevNotice } from "@/components/site/dev-notice";
import { YandexMetrika } from "@/components/site/yandex-metrika";
import { getDictionary } from "@/lib/dictionary";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function App({ Component, pageProps }: AppProps) {
  const dictionary = pageProps.dictionary || getDictionary();

  return (
    <div className={`${inter.className} app-shell`}>
      <YandexMetrika />
      <DisableStaticExportPrefetch />
      <DevNotice />
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
