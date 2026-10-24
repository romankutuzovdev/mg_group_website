import { AnchorButton, LinkButton } from "@/components/site/button";
import { CONSULTATION_TG, HERO } from "@/lib/company";

const reasons = [
  ...HERO.trust.slice(0, 4),
  "Подбор авто, машинокомплектов и спецтехники",
];

export function CtaSection() {
  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <div className="absolute inset-0 bg-stone-950" />
      <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_70%_20%,rgba(34,197,94,0.22),transparent_60%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_40%,rgba(255,255,255,0.03)_50%,transparent_60%)]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="font-display text-5xl font-semibold leading-none tracking-tight text-white sm:text-6xl md:text-7xl">
              MG<span className="text-primary">.</span>GROUP
            </p>
            <h2 className="mt-6 max-w-xl font-sans text-2xl font-medium leading-snug text-white/90 sm:text-3xl md:text-4xl">
              Готовы подобрать авто мечты из США, Китая или Кореи?
            </h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-white/70 sm:text-xl">
              Бесплатная консультация и расчёт полной стоимости под ключ — обычно за 24 часа.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
              <AnchorButton
                href={CONSULTATION_TG}
                target="_blank"
                rel="noopener noreferrer"
                size="lg"
                className="w-full rounded-full sm:w-auto"
              >
                Получить консультацию
              </AnchorButton>
              <LinkButton
                href="/avto/"
                variant="secondary"
                size="lg"
                className="w-full rounded-full border-white/25 bg-white/5 !text-white hover:bg-white/10 hover:!text-white sm:w-auto"
              >
                Каталог авто
              </LinkButton>
            </div>
          </div>

          <ul className="space-y-3 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            {reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-3 text-lg text-white/80">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
