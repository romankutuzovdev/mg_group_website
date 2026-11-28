import { GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
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
        title="Калькулятор машинокомплекта из Англии"
        description="Подготовьте ссылку Copart UK и ставку в фунтах. В расчёте учитываются сборы аукциона, перевозка с площадки и выбранная схема разборки."
      >
        <p className="mb-6 text-sm"><Link href="/mashinokomplekt/uk/" className="text-accent-dark underline">Что входит в поставку из Англии и как складывается цена</Link></p>
        <CalculatorGate calc="kit-uk" />
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
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
