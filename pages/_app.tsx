import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { DisableStaticExportPrefetch } from "@/components/layout/disable-static-export-prefetch";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { TelegramWebAppInit } from "@/components/layout/telegram-webapp-init";
import { getDictionary } from "@/lib/dictionary";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function App({ Component, pageProps }: AppProps) {
  const dictionary = pageProps.dictionary || getDictionary();

  return (
    <div className={`${inter.className} app-shell`}>
      <DisableStaticExportPrefetch />
      <TelegramWebAppInit />
      <Header dictionary={dictionary} />
      <main className="app-main">
        <Component {...pageProps} />
      </main>
      <Footer dictionary={dictionary} />
      <MobileBottomNav />
    </div>
  );
}
