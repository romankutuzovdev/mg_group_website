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

export default function UkKitCalculatorPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Калькулятор машинокомплекта Англия | MG.GROUP",
            description:
              "Просчёт машинокомплекта из Англии только по ссылке Copart UK. Ставка в фунтах, сборы, доставка с площадки и разбор.",
          },
        }}
        lang="ru"
        path="/calculator/angliya/"
      />
      <PageShell
        title="Англия"
        description="Машинокомплект только с Copart UK. Ставка в фунтах, сборы, доставка с площадки и разбор."
      >
        <CalculatorGate>
          <CalculatorForm defaultTab="uk" lockMarket />
          <p className="mt-8 text-sm text-text-muted">
            <Link href="/calculator/usa/" className="font-medium text-accent-dark underline underline-offset-2">
              США
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
