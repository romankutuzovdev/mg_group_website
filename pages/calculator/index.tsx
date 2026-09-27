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
      >
        <CalculatorGate showOverview>
          <div className="grid gap-3 sm:grid-cols-2">
            {CALCULATORS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-border bg-white p-5 transition hover:border-primary"
              >
                <h2 className="text-lg font-semibold text-text-primary">{item.title}</h2>
                <p className="mt-1 text-sm text-text-secondary">{item.text}</p>
              </Link>
            ))}
          </div>
          <div className="mt-8">
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
