import { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { CasesFeed } from "@/components/pages/cases-feed";
import { PurchasedKitsFeed } from "@/components/purchased/purchased-kits-feed";
import { LinkButton } from "@/components/site/button";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

/** Купленные машинокомплекты — доноры с разбором (не целые авто под ключ). */
export default function PurchasedKitsPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Купленные машинокомплекты | MG.GROUP",
            description:
              "Реальные лоты под машинокомплект: аукцион, доставка, разборка и просчёт под ключ из калькулятора MG.GROUP.",
          },
        }}
        lang="ru"
      />
      <PageShell
        title="Купленные машинокомплекты"
        description="Доноры с аукционов США и Англии с просчётом: ставка, доставка, разбор и итог. Это не целые авто под ключ — см. раздел «Купленные авто»."
      >
        <div className="mb-8 flex flex-wrap gap-3">
          <LinkButton href="/mashinokomplekt/#lots">Каталог лотов</LinkButton>
          <LinkButton href="/avto/" variant="secondary">
            Каталог авто
          </LinkButton>
        </div>

        <PurchasedKitsFeed />

        <div className="relative mt-16 overflow-hidden rounded-2xl border border-accent/20 bg-bg-elevated p-8 md:p-12">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
                MG.GROUP
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                Нужен такой же комплект?
              </h2>
              <p className="mt-2 max-w-lg text-sm text-text-secondary">
                Подберём донор под бланк и посчитаем аукцион, доставку и разбор.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/mashinokomplekt/#lots">Каталог лотов</LinkButton>
              <LinkButton href="/mashinokomplekt/" variant="secondary">
                Машинокомплекты
              </LinkButton>
            </div>
          </div>
        </div>
      </PageShell>

      <CasesFeed showHeaderLink={false} />
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
