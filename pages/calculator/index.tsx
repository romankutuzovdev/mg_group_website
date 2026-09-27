import { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { SiteCalculator } from "@/components/pricing/site-calculator";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

export default function CalculatorHubPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Калькуляторы MG.GROUP | Машинокомплект и авто под восстановление",
            description:
              "Отдельные калькуляторы как в боте MG.GROUP: машинокомплект (США/Англия) и авто под восстановление с растаможкой РБ.",
          },
        }}
        lang="ru"
        path="/calculator/"
      />
      <PageShell
        title="Калькуляторы просчёта"
        description="Три разных просчёта, как в боте: машинокомплект из Англии, машинокомплект из США и авто под восстановление."
      >
        <SiteCalculator mode="kit-uk" showSwitcher />
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
