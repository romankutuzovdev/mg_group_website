import { GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { CalculatorGate } from "@/components/pricing/calculator-gate";
import { QuoteHistoryPanel } from "@/components/cabinet/quote-history-panel";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

const CALCULATORS = [
  {
    href: "/calculator/usa/",
    title: "США",
    text: "Машинокомплект из США: IAAI, Bid.cars и Copart.com.",
  },
  {
    href: "/calculator/angliya/",
    title: "Англия",
    text: "Машинокомплект из Англии: только Copart UK.",
  },
  {
    href: "/calculator/vosstanovlenie/",
    title: "Восстановление",
    text: "Целое авто из США: IAAI, Bid.cars и Copart.com.",
  },
  {
    href: "/calculator/rastamozhka/",
    title: "Растаможка",
    text: "Пошлина и утильсбор в Беларусь.",
  },
] as const;

export default function CalculatorHubPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Калькуляторы MG.GROUP | США, Англия, восстановление, растаможка",
            description:
              "Отдельные калькуляторы: машинокомплект США, машинокомплект Англия, авто под восстановление и растаможка.",
          },
        }}
        lang="ru"
        path="/calculator/"
      />
      <PageShell
        title="Калькуляторы"
        description="После входа: машинокомплект США и Англия, авто под восстановление и растаможка."
        className="!pt-4 sm:!pt-5"
      >
        {/* Плашки всегда сверху — до формы входа */}
        <div className="mb-5 grid gap-3 sm:mb-6 sm:grid-cols-2">
          {CALCULATORS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group cursor-pointer rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-900 to-stone-950 p-4 text-white shadow-[0_18px_40px_-28px_rgba(28,25,23,0.55)] transition hover:-translate-y-0.5 hover:border-primary/40 sm:p-5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                MG.GROUP
              </p>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
                {item.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/65">{item.text}</p>
              <span className="mt-3 inline-flex text-sm font-semibold text-primary transition group-hover:gap-2">
                Открыть →
              </span>
            </Link>
          ))}
        </div>

        <CalculatorGate showOverview>
          <div className="mt-2">
            <QuoteHistoryPanel scope="mine" />
          </div>
        </CalculatorGate>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
