import { GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { CalculatorForm } from "@/components/pricing/calculator-form";
import { CalculatorGate } from "@/components/pricing/calculator-gate";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

export default function UsaKitCalculatorPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Калькулятор машинокомплекта США | MG.GROUP",
            description:
              "Просчёт машинокомплекта из США: IAAI, Bid.cars и Copart.com. Ставка, сборы, мили до порта и разбор.",
          },
        }}
        lang="ru"
        path="/calculator/usa/"
      />
      <PageShell
        title="США"
        description="Машинокомплект: IAAI, Bid.cars и Copart.com. Ставка в долларах, сборы, мили до порта и разбор."
      >
        <CalculatorGate>
          <CalculatorForm defaultTab="usa" lockMarket />
          <p className="mt-8 text-sm text-text-muted">
            <Link href="/calculator/angliya/" className="font-medium text-accent-dark underline underline-offset-2">
              Англия
            </Link>
            {" · "}
            <Link href="/calculator/vosstanovlenie/" className="font-medium text-accent-dark underline underline-offset-2">
              Восстановление
            </Link>
            {" · "}
            <Link href="/calculator/rastamozhka/" className="font-medium text-accent-dark underline underline-offset-2">
              Растаможка
            </Link>
          </p>
        </CalculatorGate>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
