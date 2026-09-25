import { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { FaqAccordion } from "@/components/faq/faq-accordion";
import { PageShell } from "@/components/layout/page-shell";
import { LinkButton } from "@/components/site/button";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { FAQ_ITEMS } from "@/lib/faq/content";

interface Props {
  dictionary: Dictionary;
}

function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: [...item.paragraphs, ...(item.bullets ?? []), ...(item.afterBullets ?? [])]
          .concat(item.timings?.map((row) => `${row.region}: ${row.term}`) ?? [])
          .join(" "),
      },
    })),
  };
}

export default function FaqPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "FAQ | MG.GROUP",
            description:
              "Частые вопросы о машинокомплектах, гарантиях, оплате, сроках поставки и сотрудничестве с MG.GROUP.",
          },
        }}
        lang="ru"
      />
      <PageShell
        title="FAQ"
        description="Ответы на частые вопросы о машинокомплектах, гарантиях, оплате и работе с MG.GROUP."
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }}
        />

        <FaqAccordion />

        <div className="relative mt-16 overflow-hidden rounded-2xl border border-accent/20 bg-bg-elevated p-8 md:p-12">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
                MG.GROUP
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
                Не нашли ответ?
              </h2>
              <p className="mt-2 max-w-lg text-sm text-text-secondary">
                Посчитайте поставку в калькуляторе или напишите нам — разберём лот и комплектацию
                под ваш запрос.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/calculator/">Получить расчёт</LinkButton>
              <LinkButton href="/contacts/" variant="secondary">
                Контакты
              </LinkButton>
            </div>
          </div>
        </div>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
