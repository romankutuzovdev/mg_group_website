import Image from "next/image";
import { ArrowRight, MessageCircle } from "lucide-react";
import type { Dictionary } from "@/lib/dictionary";
import heroCar from "../public/hero/mercedes-amg-s-class-mg.webp";

interface HeroProps {
  dictionary: Dictionary;
}

const PARTNERS = ["Copart", "IAAI", "Manheim", "Mobile.de", "Autoplius"] as const;

/**
 * First viewport: brand, headline, line, CTAs, full-bleed Mercedes hero.
 */
const Hero = ({ dictionary }: HeroProps) => {
  const titleMobile = dictionary.hero.titleMobile ?? dictionary.hero.title;

  return (
    <section
      id="hero"
      className="relative flex min-h-[100svh] items-end overflow-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(4.5rem+env(safe-area-inset-top))] sm:items-center sm:pb-16 lg:pb-20"
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

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[clamp(2.75rem,12vw,7.5rem)] font-semibold leading-[0.9] tracking-tight text-white motion-safe:animate-fade-up">
          MG<span className="text-primary">.</span>GROUP
        </p>

        <h1 className="mt-5 max-w-xl text-xl font-medium leading-snug text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.65)] motion-safe:animate-fade-up-delay-1 sm:mt-6 sm:text-2xl md:text-3xl md:leading-tight">
          <span className="sm:hidden">{titleMobile}</span>
          <span className="hidden sm:inline">{dictionary.hero.title}</span>
        </h1>

        <p className="mt-3 max-w-md text-base leading-relaxed text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)] motion-safe:animate-fade-up-delay-2 sm:mt-4 sm:text-lg">
          {dictionary.hero.subtitle}
        </p>

        <div className="mt-8 flex w-full max-w-sm flex-col gap-3 motion-safe:animate-fade-up-delay-3 sm:mt-10">
          <a
            href={dictionary.global.tgLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-7 text-base font-semibold text-white shadow-[0_14px_40px_-10px_rgba(34,197,94,0.75)] transition duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-14 sm:text-lg"
            aria-label="Получить консультацию в Telegram"
          >
            <MessageCircle className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden />
            {dictionary.hero.cta}
          </a>
          <a
            href="/avto/"
            className="inline-flex h-9 w-full max-w-[11.5rem] cursor-pointer items-center justify-center gap-1.5 self-start rounded-full border-2 border-white bg-black/70 px-4 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur-md transition duration-200 hover:bg-white hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Каталог авто
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </a>
        </div>

        <ul className="mt-8 flex flex-wrap gap-2 motion-safe:animate-fade-up-delay-3 sm:mt-10">
          {PARTNERS.map((name) => (
            <li
              key={name}
              className="rounded-full border border-white/30 bg-black/55 px-3.5 py-1.5 text-sm font-medium tracking-wide text-white backdrop-blur-md"
            >
              {name}
            </li>
          ))}
        </ul>
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
