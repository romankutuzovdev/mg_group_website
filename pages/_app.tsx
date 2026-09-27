import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import { useRouter } from "next/router";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { DisableStaticExportPrefetch } from "@/components/layout/disable-static-export-prefetch";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { TelegramWebAppInit } from "@/components/layout/telegram-webapp-init";
import { getDictionary } from "@/lib/dictionary";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const dictionary = pageProps.dictionary || getDictionary();
  const fullPage = router.pathname === "/cabinet" || router.pathname.startsWith("/cabinet/");

  return (
    <div className={`${inter.className} app-shell${fullPage ? " app-shell--full" : ""}`}>
      <DisableStaticExportPrefetch />
      <TelegramWebAppInit />
      {fullPage ? null : <Header dictionary={dictionary} />}
      <main className={fullPage ? "app-main app-main--full" : "app-main"}>
        <Component {...pageProps} />
      </main>
      {fullPage ? null : <Footer dictionary={dictionary} />}
      {fullPage ? null : <MobileBottomNav />}
    </div>
  );
}
