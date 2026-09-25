import { GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { RestorationCalculator } from "@/components/pricing/restoration-calculator";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

export default function CalculatorPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Просчёт авто | MG.GROUP",
            description:
              "Калькулятор авто под заказ из США: ставка Bid.cars, доставка, Title и растаможка РБ.",
          },
        }}
        lang="ru"
        path="/calculator/"
      />
      <PageShell
        title="Просчёт авто"
        description="Сборы, доставка Klaipeda/Poti и таможня РБ — расчёт целого авто под ключ."
      >
        <RestorationCalculator />
        <p className="mt-10 text-sm text-text-muted">
          Нужен машинокомплект?{" "}
          <Link href="/mashinokomplekt/" className="font-medium text-accent-dark underline underline-offset-2">
            Машинокомплекты из США и Англии
          </Link>
        </p>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
