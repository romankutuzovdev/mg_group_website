import { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { CasesFeed } from "@/components/pages/cases-feed";
import { PurchasedKitsFeed } from "@/components/purchased/purchased-kits-feed";
import { LinkButton } from "@/components/site/button";
import { fetchPublishedKits, type PublishedKit } from "@/lib/api/client";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
  purchased: PublishedKit[] | null;
}

/** Купленные машинокомплекты — доноры с разбором (не целые авто под ключ). */
export default function PurchasedKitsPage({ dictionary, purchased }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Купленные машинокомплекты | MG.GROUP",
            description:
              "Выкупленные доноры в публичной витрине MG.GROUP и примеры расчёта машинокомплектов из США и Англии с доставкой в Минск.",
          },
        }}
        lang="ru"
        path="/kuplennye-mashinokomplekty/"
      />
      <PageShell
        title="Купленные машинокомплекты"
        description="Здесь менеджеры публикуют доноров из США и Англии после выкупа. Ниже можно посмотреть, как меняется бюджет комплекта при заданной ставке."
      >
        <div className="mb-8 flex flex-wrap gap-3">
          <LinkButton href="/mashinokomplekt/#lots">Каталог лотов</LinkButton>
          <LinkButton href="/avto/" variant="secondary">
            Каталог авто
          </LinkButton>
        </div>

        <PurchasedKitsFeed initialItems={purchased} />

        <div className="relative mt-16 overflow-hidden rounded-2xl border border-accent/20 bg-bg-elevated p-8 md:p-12">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
                MG.GROUP
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                Как подобрать машинокомплект?
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
  props: { dictionary: getDictionary(), purchased: await fetchPublishedKits().catch(() => null) },
  ...(process.env.VERCEL === "1" ? { revalidate: 120 } : {}),
});
