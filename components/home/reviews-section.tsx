import Link from "next/link";
import { LinkButton, AnchorButton } from "@/components/site/button";
import { REVIEWS, REVIEW_LINKS } from "@/lib/reviews";

type Props = {
  limit?: number;
  showAllLink?: boolean;
};

export function ReviewsSection({ limit = 3, showAllLink = true }: Props) {
  const items = REVIEWS.slice(0, limit);

  return (
    <section id="reviews" className="border-t border-border bg-bg-elevated py-14 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="lux-kicker">Отзывы</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Клиенты о MG.GROUP
            </h2>
            <p className="mt-3 text-sm text-text-secondary sm:text-base">
              Реальные истории подбора и доставки. Хотите добавить свой отзыв — напишите менеджеру.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showAllLink ? (
              <LinkButton href="/otzyvy/" variant="secondary" className="w-full sm:w-auto">
                Все отзывы
              </LinkButton>
            ) : null}
            <AnchorButton
              href={REVIEW_LINKS.telegram}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              Оставить отзыв
            </AnchorButton>
          </div>
        </div>

        <ul className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {items.map((review) => (
            <li
              key={review.id}
              className="flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6"
            >
              <p className="text-sm leading-relaxed text-zinc-700">«{review.text}»</p>
              <div className="mt-auto border-t border-zinc-100 pt-4">
                <p className="text-sm font-semibold text-zinc-900">{review.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {[review.city, review.car, review.date].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {showAllLink ? (
          <p className="mt-6 text-center text-sm text-text-muted">
            Больше историй — на странице{" "}
            <Link href="/otzyvy/" className="font-medium text-accent-dark underline underline-offset-2">
              отзывов
            </Link>
            .
          </p>
        ) : null}
      </div>
    </section>
  );
}
