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

export default function RestorationCalculatorPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Калькулятор авто под восстановление | MG.GROUP",
            description:
              "Просчёт целого авто из США по ссылке Bid.cars: аукционный сбор как на Bid.cars, площадка, доставка и растаможка РБ.",
          },
        }}
        lang="ru"
        path="/calculator/vosstanovlenie/"
      />
      <PageShell
        title="Авто под восстановление"
        description="Только ссылка Bid.cars. Аукционный сбор и площадка берутся из лота."
      >
        <CalculatorGate calc="car" />
        <p className="mt-8 text-sm text-text-muted">
          <Link href="/calculator/usa/" className="font-medium text-accent-dark underline underline-offset-2">
            США
          </Link>
          {" · "}
          <Link href="/calculator/angliya/" className="font-medium text-accent-dark underline underline-offset-2">
            Англия
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
