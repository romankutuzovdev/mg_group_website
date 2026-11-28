import Link from "next/link";
import { LinkButton } from "@/components/site/button";
import { formatCaseMoney, KIT_EXAMPLES, type KitOrigin } from "@/lib/cases";

export function KitExampleCard({ origin }: { origin: KitOrigin }) {
  const example = KIT_EXAMPLES[origin];
  return (
    <article className="rounded-2xl border border-border bg-white p-5 sm:p-6">
      <h3 className="font-display text-xl font-semibold">{example.title}</h3>
      <p className="mt-2 text-sm text-text-muted">{example.source}, лот № {example.lotNumber}. Расчёт от {example.date}.</p>
      <p className="mt-3 text-sm leading-relaxed text-text-secondary">{example.assumptions}</p>
      <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        {example.lines.map(([label, amount, currency]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="shrink-0 tabular-nums">{formatCaseMoney(amount, currency)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3 font-semibold">
          <dt>Расчётный итог до Минска</dt>
          <dd className="shrink-0 tabular-nums">{formatCaseMoney(example.totalUsd, "USD")}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm">
        <Link href={`/mashinokomplekt/${origin}/#lots`} className="font-medium text-accent-dark underline underline-offset-2">
          Другие лоты из {origin === "usa" ? "США" : "Англии"}
        </Link>
      </p>
    </article>
  );
}

export function CasesFeed({ showHeaderLink = true }: { showHeaderLink?: boolean }) {
  return (
    <section id="cases" className="scroll-mt-28 border-t border-border bg-bg-base py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Примеры расчёта машинокомплектов
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
          Выбрали два лота из открытого каталога и посчитали, сколько стоил бы комплект при заданной ставке.
          Фактическая цена зависит от результата торгов и согласованного бланка разборки.
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <KitExampleCard origin="usa" />
          <KitExampleCard origin="uk" />
        </div>
        {showHeaderLink && (
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href="/mashinokomplekt/#lots">Каталог лотов</LinkButton>
            <LinkButton href="/kuplennye-mashinokomplekty/" variant="secondary">Купленные комплекты</LinkButton>
          </div>
        )}
      </div>
    </section>
  );
}
