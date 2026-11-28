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
        title="Калькулятор машинокомплекта из США"
        description="Для расчёта понадобятся ссылка на лот, ставка в долларах США, площадка и схема разборки. Итог зависит в том числе от аукционных сборов и расстояния до порта."
      >
        <p className="mb-6 text-sm"><Link href="/mashinokomplekt/usa/" className="text-accent-dark underline">Что входит в поставку из США и как складывается цена</Link></p>
        <CalculatorGate calc="kit-usa" />
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
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
