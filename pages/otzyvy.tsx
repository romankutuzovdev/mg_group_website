import { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { AnchorButton, LinkButton } from "@/components/site/button";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { REVIEWS, REVIEW_LINKS } from "@/lib/reviews";

interface Props {
  dictionary: Dictionary;
}

export default function OtzyvyPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Отзывы клиентов | MG.GROUP",
            description:
              "Отзывы о подборе и доставке авто из США, Китая и Кореи с MG.GROUP. Оставьте свой отзыв менеджеру.",
          },
        }}
        lang="ru"
        path="/otzyvy/"
      />
      <PageShell
        title="Отзывы клиентов"
        description="Истории подбора, выкупа и доставки под ключ. Работаем по договору, считаем полную стоимость до ставки."
      >
        <div className="mb-8 flex flex-wrap gap-3">
          <AnchorButton href={REVIEW_LINKS.telegram} target="_blank" rel="noopener noreferrer">
            Оставить отзыв в Telegram
          </AnchorButton>
          <LinkButton href="/kuplennye-avto/" variant="secondary">
            Купленные авто
          </LinkButton>
          <LinkButton href="/avto/" variant="secondary">
            Каталог
          </LinkButton>
        </div>

        <ul className="grid gap-4 md:grid-cols-2">
          {REVIEWS.map((review) => (
            <li
              key={review.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6"
            >
              <p className="text-sm leading-relaxed text-zinc-700 sm:text-[15px]">
                «{review.text}»
              </p>
              <div className="mt-4 border-t border-zinc-100 pt-4">
                <p className="font-semibold text-zinc-900">{review.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {[review.city, review.car, review.date].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-12 rounded-2xl border border-accent/20 bg-bg-elevated p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold sm:text-2xl">
            Привезли авто — расскажите об опыте
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            Короткий отзыв помогает следующим клиентам. Напишите менеджеру в Telegram — опубликуем
            на сайте (по согласованию).
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <AnchorButton href={REVIEW_LINKS.telegram} target="_blank" rel="noopener noreferrer">
              Написать отзыв
            </AnchorButton>
            <LinkButton href="/contacts/" variant="secondary">
              Контакты
            </LinkButton>
          </div>
        </div>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
