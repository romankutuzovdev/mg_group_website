import { GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { SiteCalculator } from "@/components/pricing/site-calculator";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

export default function CalculatorHubPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Калькуляторы MG.GROUP | Машинокомплект и авто под восстановление",
            description:
              "Отдельные калькуляторы как в боте MG.GROUP: машинокомплект (США/Англия) и авто под восстановление с растаможкой РБ.",
          },
        }}
        lang="ru"
        path="/calculator/"
      />
      <PageShell
        title="Калькуляторы просчёта"
        description="Как в Telegram-боте: машинокомплект и целое авто — разные формулы, разные страницы."
      >
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/calculator/mashinokomplekt/"
            className="rounded-xl border border-border bg-white p-4 transition hover:border-accent-dark/40 hover:shadow-sm"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Как в боте
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-text-primary">
              Машинокомплект
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              США и Англия: ставка, сборы, доставка, разбор.
            </p>
          </Link>
          <Link
            href="/calculator/vosstanovlenie/"
            className="rounded-xl border border-border bg-white p-4 transition hover:border-accent-dark/40 hover:shadow-sm"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Как в боте
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-text-primary">
              Авто под восстановление
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Целое авто: доставка Klaipeda/Poti и таможня РБ.
            </p>
          </Link>
        </div>

        <SiteCalculator mode="car" showSwitcher />
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
