"use client";

import Head from "next/head";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SEO from "@/components/SEO";
import { CabinetFrame } from "@/components/cabinet/app-shell";
import { ManagersAdmin } from "@/components/cabinet/managers-admin";
import { getDictionary } from "@/lib/dictionary";

export default function CabinetManagersPage() {
  const dictionary = getDictionary();
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Менеджеры | Кабинет MG.GROUP",
            description: "Назначение менеджеров личного кабинета MG.GROUP.",
          },
        }}
        lang="ru"
        path="/cabinet/managers/"
      />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <CabinetFrame>
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/cabinet/?tab=manager" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-[11px] font-bold text-white">
                MG
              </span>
              <span className="text-[13px] text-zinc-500">
                Кабинет <span className="mx-1 text-zinc-300">/</span>
                <span className="font-medium text-zinc-900">Менеджеры</span>
              </span>
            </Link>
            <Link
              href="/cabinet/?tab=manager"
              className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> В CRM
            </Link>
          </div>
        </header>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Менеджеры</h1>
          <p className="mt-1 text-[13px] text-zinc-500">Кому из сотрудников доступна CRM и логистика.</p>
          <div className="mt-5">
            <ManagersAdmin />
          </div>
        </div>
      </CabinetFrame>
    </>
  );
}
