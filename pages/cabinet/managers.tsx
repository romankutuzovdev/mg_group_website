"use client";

import Head from "next/head";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
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
      <PageShell bare className="!max-w-none">
        <div className="relative overflow-hidden border-b border-zinc-200/80 bg-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_120px_at_0%_0%,rgba(16,185,129,0.12),transparent),radial-gradient(600px_100px_at_100%_0%,rgba(24,24,27,0.04),transparent)]" />
          <div className="relative mx-auto max-w-2xl px-4 py-3 sm:px-6 sm:py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Admin
                </p>
                <p className="mt-0.5 text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
                  Управление менеджерами
                </p>
                <Link
                  href="/cabinet/"
                  className="mt-2.5 inline-flex h-8 items-center gap-2 rounded-lg bg-zinc-900 px-2.5 text-[11px] font-bold text-white transition hover:bg-emerald-700"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-[9px]">
                    MG
                  </span>
                  Кабинет
                </Link>
              </div>
              <Link
                href="/cabinet/?tab=manager"
                className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
              >
                К сделкам
              </Link>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
          <ManagersAdmin />
        </div>
      </PageShell>
    </>
  );
}
