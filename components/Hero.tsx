import Image from "next/image";
import { ArrowRight, MessageCircle } from "lucide-react";
import type { Dictionary } from "@/lib/dictionary";
import heroCar from "../public/hero/mercedes-amg-s-class-mg.webp";

interface HeroProps {
  dictionary: Dictionary;
}

const PARTNERS = ["Copart", "IAAI", "Manheim", "Mobile.de", "Autoplius", "Encar", "Che168", "Guazi"] as const;

/**
 * First viewport: brand, headline, line, CTAs, full-bleed Mercedes hero.
 */
const Hero = ({ dictionary }: HeroProps) => {
  const titleMobile = dictionary.hero.titleMobile ?? dictionary.hero.title;

  return (
    <section
      id="hero"
      className="relative flex min-h-[100svh] items-end overflow-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(6.5rem+env(safe-area-inset-top))] sm:items-center sm:pb-16 sm:pt-[calc(7.5rem+env(safe-area-inset-top))] lg:pb-20"
    >
      <div className="absolute inset-0 z-0">
        <Image
          src={heroCar}
          alt="Mercedes-AMG S-Class MG.GROUP"
          fill
          priority
          className="object-cover object-[68%_55%] scale-105 motion-safe:animate-hero-ken sm:object-[72%_48%]"
          quality={92}
          sizes="100vw"
        />
        {/* Keep left readable for brand text; let car stay vivid on the right */}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/45" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_55%,rgba(34,197,94,0.16),transparent_50%)]" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-end gap-8 px-4 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8">
        <div className="pt-4 sm:pt-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/45 px-3.5 py-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md motion-safe:animate-fade-up">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Под ключ · Беларусь
          </p>
          <p className="mt-5 text-[clamp(2.5rem,8vw,5.5rem)] font-semibold leading-[0.9] tracking-tight text-white motion-safe:animate-fade-up">
            MG<span className="text-primary">.</span>GROUP
          </p>

          <h1 className="mt-5 max-w-2xl whitespace-pre-line text-2xl font-medium leading-snug text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)] motion-safe:animate-fade-up-delay-1 sm:mt-6 sm:text-3xl md:text-4xl lg:text-5xl md:leading-tight">
            <span className="sm:hidden">{titleMobile}</span>
            <span className="hidden sm:inline">{dictionary.hero.title}</span>
          </h1>

          <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)] motion-safe:animate-fade-up-delay-2 sm:text-xl md:text-2xl">
            {dictionary.hero.subtitle}
          </p>

          <div className="mt-8 flex w-full max-w-md flex-col gap-3 motion-safe:animate-fade-up-delay-3 sm:mt-10">
            <a
              href={dictionary.global.tgLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-8 text-lg font-semibold text-white shadow-[0_14px_40px_-10px_rgba(34,197,94,0.75)] transition duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-16 sm:text-xl"
              aria-label="Получить консультацию в Telegram"
            >
              <MessageCircle className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" aria-hidden />
              {dictionary.hero.cta}
            </a>
            <a
              href="/avto/"
              className="inline-flex h-12 w-full max-w-[14rem] cursor-pointer items-center justify-center gap-2 self-start rounded-full border-2 border-white bg-black/70 px-5 text-base font-semibold !text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur-md transition duration-200 hover:bg-white/15 hover:!text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Каталог авто
              <ArrowRight className="h-4 w-4 shrink-0 text-white" aria-hidden />
            </a>
          </div>

          <ul className="mt-8 flex flex-wrap gap-2.5 motion-safe:animate-fade-up-delay-3 sm:mt-10">
            {PARTNERS.map((name) => (
              <li
                key={name}
                className="rounded-full border border-white/30 bg-black/55 px-4 py-2 text-base font-medium tracking-wide text-white backdrop-blur-md"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>

        <aside className="hidden rounded-[1.75rem] border border-white/20 bg-black/40 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl lg:block">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Сделка под ключ</p>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            {[
              ["до 30%", "выгода к рынку РБ"],
              ["2–3 мес.", "средний срок"],
              ["5 рынков", "США · Китай · Корея · UK"],
              ["24 ч", "ответ на расчёт"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <dt className="text-3xl font-semibold tracking-tight text-white">{value}</dt>
                <dd className="mt-1 text-base leading-snug text-white/70">{label}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      <div
        className="pointer-events-none absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 md:flex"
        aria-hidden
      >
        <span className="text-[10px] uppercase tracking-[0.3em] text-white/70">Scroll</span>
        <span className="h-10 w-px bg-gradient-to-b from-primary to-transparent motion-safe:animate-pulse" />
      </div>
    </section>
  );
};

export default Hero;
