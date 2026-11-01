import { ArrowDown, ArrowRight } from "lucide-react";
import type { Dictionary } from "@/lib/dictionary";
import { HeroCarReveal } from "@/components/hero-car-reveal";
import { LinkButton } from "@/components/site/button";

export default function Hero({ dictionary }: { dictionary: Dictionary }) {
  return (
    <section id="hero" className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-bg-dark pb-48 pt-28 text-white sm:pb-40 lg:min-h-[820px] lg:pb-36">
      <HeroCarReveal />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-black/90 via-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      <div className="pointer-events-none relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-[42rem]">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-white/75">MG<span className="text-primary">.</span>GROUP <span className="mx-3 text-white/35">/</span> Доставка в Беларусь</p>
          <h1 className="mt-7 max-w-[13ch] text-[clamp(2.5rem,5.4vw,5rem)] font-medium leading-[1.04] tracking-[-0.045em] text-white">Ваш автомобиль.<br /><span className="text-white/65">Без границ.</span></h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">Подбор и доставка авто из США, Китая и Кореи. От первой ставки до ключей в ваших руках.</p>
          <div className="pointer-events-auto mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="#car-finder" size="lg">Подобрать автомобиль <ArrowRight className="h-4 w-4" aria-hidden /></LinkButton>
            <LinkButton href="#catalog-showcase" variant="outline" size="lg">Смотреть автомобили</LinkButton>
          </div>
          <p className="mt-5 text-xs text-white/60">{dictionary.hero.subtitle}</p>
        </div>
      </div>
      <a href="#directions" className="absolute bottom-8 left-4 z-20 hidden items-center gap-3 text-xs text-white/70 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:left-6 md:inline-flex lg:left-[max(2rem,calc((100vw-76rem)/2))]">
        <ArrowDown className="h-4 w-4" aria-hidden /> Откройте возможности
      </a>
    </section>
  );
}
