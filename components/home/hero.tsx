import { CountUp } from "@/components/fx/count-up";
import { HeroBackdrop } from "@/components/home/hero-backdrop";
import { LinkButton } from "@/components/site/button";
import { HERO } from "@/lib/company";

const DUST = Array.from({ length: 16 }, (_, i) => ({
  left: `${5 + ((i * 17) % 90)}%`,
  delay: `${(i * 0.42) % 7}s`,
  duration: `${8 + (i % 5)}s`,
}));

export function Hero() {
  return (
    <section id="hero" className="relative min-h-[70svh] overflow-hidden pt-[calc(3.5rem+env(safe-area-inset-top))] sm:min-h-[85svh] md:min-h-[88vh]">
      <HeroBackdrop />
      <div className="hero-overlay absolute inset-0" />
      <div className="hero-aurora" />
      <div className="hero-sweep" />
      <div className="hero-dust absolute inset-0 overflow-hidden" aria-hidden>
        {DUST.map((dot) => (
          <span
            key={dot.left + dot.delay}
            style={{ left: dot.left, bottom: "-8px", animationDelay: dot.delay, animationDuration: dot.duration }}
          />
        ))}
      </div>
      <div className="bg-noise absolute inset-0 opacity-30" />

      <div className="relative mx-auto flex min-h-[calc(70svh-3.5rem-env(safe-area-inset-top))] max-w-7xl flex-col justify-end px-3 py-6 pb-8 sm:min-h-[calc(85svh-4rem-env(safe-area-inset-top))] sm:justify-center sm:px-6 sm:py-16 md:min-h-[calc(88vh-4rem-env(safe-area-inset-top))] lg:px-8">
        <div className="badge-primary animate-fade-up mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-accent/20 px-3 py-1.5 text-xs font-medium sm:mb-6 sm:text-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          {HERO.badge}
        </div>

        <h1 className="animate-fade-up-delay-1 max-w-4xl font-display text-[1.75rem] font-bold leading-tight tracking-tight text-text-on-dark sm:text-3xl md:text-5xl lg:text-6xl">
          {HERO.title}
        </h1>
        <p className="animate-fade-up-delay-2 mt-3 max-w-2xl text-sm uppercase tracking-wide text-text-on-dark-muted sm:mt-4 sm:text-lg">
          {HERO.subtitle}
        </p>

        <div className="animate-fade-up-delay-3 mt-6 grid w-full gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-3">
          {HERO.cards.map((card) => (
            <article key={card.title} className="card-dark rounded-xl p-4">
              <h2 className="font-display text-base font-semibold text-text-on-dark lg:text-lg">
                {card.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {card.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-text-on-dark-muted">
                    <span className="h-1 w-2 shrink-0 rounded-full bg-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <ul className="mt-6 grid gap-2 text-sm text-text-on-dark-muted sm:mt-8 sm:grid-cols-2">
          {HERO.trust.map((item) => (
            <li key={item}>— {item}</li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-4">
          <LinkButton href="#car-finder" size="lg" className="w-full sm:w-auto">
            Получить консультацию
          </LinkButton>
          <LinkButton href="/about" variant="outline" size="lg" className="w-full sm:w-auto">
            Подробнее
          </LinkButton>
          <LinkButton href="/mashinokomplekt/" variant="outline" size="lg" className="w-full sm:w-auto">
            Машинокомплекты
          </LinkButton>
        </div>
      </div>

      <div className="hero-scroll-hint pointer-events-none absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 md:flex">
        <span className="text-[10px] uppercase tracking-[0.28em] text-white/50">Scroll</span>
        <span className="h-8 w-px bg-gradient-to-b from-accent to-transparent" />
      </div>
    </section>
  );
}

const stats = [
  { label: "выгода vs рынок РБ" },
  { value: "США · Китай · Корея", label: "авто под заказ" },
  { value: "США · Англия", label: "машинокомплекты" },
  { value: "9:00–19:00", label: "будни, Гродно" },
];

export function StatsBar() {
  return (
    <section className="border-y border-border bg-bg-base py-8 md:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
          <div className="card-premium reveal-on-scroll rounded-xl p-4 text-center md:p-6 md:text-left">
            <p className="font-display text-lg font-semibold text-accent-dark md:text-2xl">
              <CountUp prefix="до " value={30} suffix="%" />
            </p>
            <p className="mt-1 text-xs text-text-secondary sm:text-sm">{stats[0].label}</p>
          </div>
          {stats.slice(1).map((stat) => (
            <div key={stat.label} className="card-premium reveal-on-scroll rounded-xl p-4 text-center md:p-6 md:text-left">
              <p className="font-display text-lg font-semibold text-accent-dark md:text-2xl">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-text-secondary sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
