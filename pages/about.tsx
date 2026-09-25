import { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { Team } from "@/components/pages/team";
import { AnchorButton, LinkButton } from "@/components/site/button";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { BENEFITS, COMPANY, CONSULTATION_TG, HERO } from "@/lib/company";

interface Props {
  dictionary: Dictionary;
}

export default function AboutPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "О нас | MG.GROUP",
            description:
              "MG.GROUP — тщательный подбор автомобилей, профессиональная логистика и прозрачные условия.",
          },
        }}
        lang="ru"
      />
      <PageShell
        title="О нас"
        description="Подбор и доставка авто под заказ из США, Китая и Кореи. Машинокомплекты из США и Англии."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-lg leading-relaxed text-text-secondary">{COMPANY.description}.</p>
            <p className="mt-4 leading-relaxed text-text-secondary">
              Официальные партнёры {COMPANY.partners}. Доставляем автомобили и машинокомплекты
              оптом, даём гарантию качества и оригинальности, берём на себя полное таможенное
              оформление.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-text-secondary">
              {HERO.trust.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="card-premium rounded-2xl p-8">
            <h2 className="font-display text-xl font-semibold">Направления</h2>
            <ul className="mt-4 space-y-4 text-sm text-text-secondary">
              {HERO.cards.map((card) => (
                <li key={card.title}>
                  <p className="font-semibold text-text-primary">{card.title}</p>
                  <p className="mt-1">{card.items.join(" · ")}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="font-display text-2xl font-semibold">Преимущества нашей компании</h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {BENEFITS.map((item) => (
              <article key={item.number} className="card-premium rounded-2xl p-8">
                <span className="font-display text-3xl font-bold text-accent">{item.number}</span>
                <h3 className="mt-3 font-display text-lg font-semibold uppercase">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.description}</p>
              </article>
            ))}
          </div>
        </div>

        <Team embedded />

        <div className="mt-12 flex flex-wrap gap-3">
          <AnchorButton href={CONSULTATION_TG} target="_blank" rel="noopener noreferrer">
            Нужна консультация
          </AnchorButton>
          <LinkButton href="/contacts/" variant="secondary">
            Контакты
          </LinkButton>
        </div>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
