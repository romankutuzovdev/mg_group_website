import type { AppProps } from "next/app";
import { Cormorant } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { DisableStaticExportPrefetch } from "@/components/layout/disable-static-export-prefetch";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { CookieConsent } from "@/components/site/cookie-consent";
import { YandexMetrika } from "@/components/site/yandex-metrika";
import { getDictionary } from "@/lib/dictionary";
import "@/styles/globals.css";

const cormorant = Cormorant({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

export default function App({ Component, pageProps }: AppProps) {
  const dictionary = pageProps.dictionary || getDictionary();

  return (
    <div
      className={`${cormorant.variable} ${cormorant.className} app-shell font-sans text-base antialiased`}
    >
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
