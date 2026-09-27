import { GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { SiteCalculator } from "@/components/pricing/site-calculator";
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
              "Просчёт целого авто из США: ставка Bid.cars / IAAI / Copart, доставка Klaipeda или Poti, Title и растаможка РБ — как в боте MG.GROUP.",
          },
        }}
        lang="ru"
        path="/calculator/vosstanovlenie/"
      />
      <PageShell
        title="Авто под восстановление"
        description="Отдельный расчёт целого авто: ставка, доставка и таможня РБ под ключ."
      >
        <SiteCalculator mode="car" showSwitcher={false} />
        <p className="mt-8 text-sm text-text-muted">
          Нужен машинокомплект?{" "}
          <Link
            href="/calculator/mashinokomplekt/"
            className="font-medium text-accent-dark underline underline-offset-2"
          >
            Калькулятор машинокомплекта
          </Link>
          {" · "}
          <Link href="/avto/" className="font-medium text-accent-dark underline underline-offset-2">
            Каталог авто
          </Link>
        </p>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
