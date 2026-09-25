import { AnchorButton, LinkButton } from "@/components/site/button";
import { CONSULTATION_TG, HERO } from "@/lib/company";

const reasons = [...HERO.trust, "Подбор авто, машинокомплектов и спецтехники", "Консультация в Telegram и Viber"];

export function CtaSection() {
  return (
    <section className="border-t border-border py-14 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="lux-frame relative overflow-hidden rounded-2xl border border-accent/20 bg-bg-elevated p-6 sm:p-10 md:p-16">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <div className="lux-mesh" />
          <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="lux-kicker">MG.GROUP</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                Готовы подобрать авто <span className="text-gradient-green">мечты</span> из США?
              </h2>
              <p className="mt-4 text-text-secondary">
                Бесплатная консультация и расчёт полной стоимости под ключ — за 24 часа.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                <AnchorButton href={CONSULTATION_TG} target="_blank" rel="noopener noreferrer" size="lg" className="w-full sm:w-auto">
                  Получить консультацию
                </AnchorButton>
                <LinkButton href="/avto/" variant="secondary" size="lg" className="w-full sm:w-auto">
                  Каталог авто
                </LinkButton>
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {reasons.map((reason) => (
                <li
                  key={reason}
                  className="card-premium flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-text-secondary"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
