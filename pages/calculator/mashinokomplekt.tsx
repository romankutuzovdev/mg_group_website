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

export default function KitCalculatorPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Калькулятор машинокомплекта | США и Англия | MG.GROUP",
            description:
              "Просчёт машинокомплекта: ссылка IAAI, Bid.cars, Copart.com или Copart UK. США и Англия считаются разными формулами.",
          },
        }}
        lang="ru"
        path="/calculator/mashinokomplekt/"
      />
      <PageShell
        title="Калькулятор машинокомплекта"
        description="IAAI, Bid.cars, Copart.com и Copart UK. Ссылка переключает расчёт на США или Англию."
      >
        <CalculatorGate>
          <SiteCalculator mode="kit-usa" showSwitcher={false} kitDefaultTab="usa" />
          <p className="mt-8 text-sm text-text-muted">
            Нужен расчёт целого авто?{" "}
            <Link
              href="/calculator/vosstanovlenie/"
              className="font-medium text-accent-dark underline underline-offset-2"
            >
              Калькулятор под восстановление
            </Link>
            {" · "}
            <Link href="/mashinokomplekt/" className="font-medium text-accent-dark underline underline-offset-2">
              Каталог комплектов
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
