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
              "Просчёт машинокомплекта из США и Англии: ставка Copart/IAAI/Copart UK, сборы, доставка и разбор — как в боте MG.GROUP.",
          },
        }}
        lang="ru"
        path="/calculator/mashinokomplekt/"
      />
      <PageShell
        title="Калькулятор машинокомплекта"
        description="Отдельный расчёт комплекта: ставка, аукционные сборы, доставка и разбор (США / Англия)."
      >
        <SiteCalculator mode="kits" showSwitcher={false} kitDefaultTab="usa" />
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
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
