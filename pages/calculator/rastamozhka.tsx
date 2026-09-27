import { GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { SiteCalculator } from "@/components/pricing/site-calculator";
import { CalculatorGate } from "@/components/pricing/calculator-gate";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

export default function CustomsCalculatorPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Калькулятор растаможки | MG.GROUP",
            description:
              "Растаможка авто в Беларусь: пошлина и утильсбор по цене, году и объёму двигателя.",
          },
        }}
        lang="ru"
        path="/calculator/rastamozhka/"
      />
      <PageShell
        title="Растаможка"
        description="Пошлина и утильсбор в Беларусь по цене авто, году и объёму двигателя."
      >
        <CalculatorGate>
          <SiteCalculator mode="customs" showSwitcher={false} />
          <p className="mt-8 text-sm text-text-muted">
            <Link href="/calculator/usa/" className="font-medium text-accent-dark underline underline-offset-2">
              США
            </Link>
            {" · "}
            <Link href="/calculator/angliya/" className="font-medium text-accent-dark underline underline-offset-2">
              Англия
            </Link>
            {" · "}
            <Link href="/calculator/vosstanovlenie/" className="font-medium text-accent-dark underline underline-offset-2">
              Восстановление
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
