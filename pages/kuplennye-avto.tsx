import { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { PurchasedCarsFeed } from "@/components/purchased/purchased-cars-feed";
import { LinkButton } from "@/components/site/button";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

/** Целые авто под ключ — примеры добавляет менеджер в кабинете. */
export default function PurchasedCarsPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Купленные авто | MG.GROUP",
            description:
              "Примеры выкупленных целых авто под ключ из США и Англии: аукцион, доставка и сравнение с рынком Беларуси.",
          },
        }}
        lang="ru"
        path="/kuplennye-avto/"
      />
      <PageShell
        title="Купленные авто"
        description="Целые автомобили под ключ с доставкой; помогаем с таможенным оформлением (на учёт не ставим). Раздел ведёт менеджер — только реальные покупки."
      >
        <PurchasedCarsFeed />

        <div className="mt-10 flex flex-wrap gap-3">
          <LinkButton href="/avto/" variant="secondary">
            Каталог авто
          </LinkButton>
          <LinkButton href="/avto/usa/" variant="secondary">
            Лоты на аукционах
          </LinkButton>
        </div>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
