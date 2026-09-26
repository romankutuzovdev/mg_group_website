import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { MessageCircle, ArrowRight, ChevronDown, Car, Wrench, Tractor } from 'lucide-react';
import type { Dictionary } from '@/lib/dictionary';
import bgImage from '../public/bgImage.avif';

interface HeroProps {
  dictionary: Dictionary;
}

const SERVICE_CARDS = [
  {
    icon: Car,
    titleShort: "Авто из США, Китая, Кореи",
    titleFull: "Автомобили из США, Китая и Кореи",
    items: ["Выгода до 30% от рынка РБ", "Таможня под ключ"],
  },
  {
    icon: Wrench,
    titleShort: "Комплекты США / Англия",
    titleFull: "Машинокомплекты и двигатели оптом из США и Англии",
    items: ["Оригинальные детали", "Быстрая доставка"],
  },
  {
    icon: Tractor,
    titleShort: "Спецтехника",
    titleFull: "Техника и спецтехника",
    items: ["Гидроциклы и квадроциклы", "Лодки и стройтехника"],
  },
] as const;

function HeroTitle({ mobile, desktop }: { mobile: string; desktop: string }) {
  return (
    <>
      <span className="whitespace-pre-line sm:hidden">{mobile}</span>
      <span className="hidden whitespace-pre-line sm:inline">{desktop}</span>
    </>
  );
}

const Hero = ({ dictionary }: HeroProps) => {
  const scrollToContent = () => {
    window.scrollTo({
      top: window.innerHeight,
      behavior: 'smooth',
    });
  };

  const titleMobile = dictionary.hero.titleMobile ?? dictionary.hero.title;
  const benefitsMobile = dictionary.hero.benefitsMobile ?? dictionary.hero.benefits;

  return (
    <section
      id="hero"
      className="relative flex min-h-[100svh] items-center overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
    >
      <div className="absolute inset-0 z-0">
        <Image
          src={bgImage}
          alt="Авто под заказ из США, Китая и Кореи — MG.GROUP"
          fill
          priority
          className="object-cover"
          quality={90}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/80 to-black/70" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-16 lg:px-8 lg:py-32">
        <div className="max-w-3xl">
          <div className="mb-3 mt-12 inline-flex max-w-full items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary sm:mb-6 sm:mt-2 sm:px-3 sm:py-1.5 sm:text-sm">
            <span className="relative flex h-1.5 w-1.5 shrink-0 sm:h-2 sm:w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary sm:h-2 sm:w-2" />
            </span>
            <span className="min-w-0 truncate">
              <span className="sm:hidden">Copart · IAAI · Manheim</span>
              <span className="hidden sm:inline">
                Официальные партнеры Copart, IAAI, Manheim, Mobile.de, Autoplius.lt
              </span>
            </span>
          </div>

          <h1 className="mb-4 max-w-full break-words text-[1.375rem] font-bold uppercase leading-[1.2] tracking-tight text-white sm:mb-8 sm:text-4xl sm:leading-tight md:text-5xl lg:text-6xl">
            <HeroTitle mobile={titleMobile} desktop={dictionary.hero.title} />
          </h1>
        </div>

        <div className="mb-5 grid w-full grid-cols-1 gap-2 sm:mb-8 sm:gap-4 lg:grid-cols-3 lg:gap-6">
          {SERVICE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.titleFull}
                className="h-full rounded-xl bg-white/5 p-3 backdrop-blur-sm sm:p-4"
              >
                <div className="mb-2 flex items-start gap-2 sm:mb-3 sm:items-center sm:gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary sm:mt-0 sm:h-6 sm:w-6" />
                  <h2 className="min-w-0 break-words text-[13px] font-semibold leading-snug text-white sm:text-base lg:text-lg">
                    <span className="sm:hidden">{card.titleShort}</span>
                    <span className="hidden sm:inline">{card.titleFull}</span>
                  </h2>
                </div>
                <ul className="space-y-1 sm:space-y-2">
                  {card.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[11px] text-white/90 sm:items-center sm:text-sm"
                    >
                      <div className="mt-1.5 h-1 w-2 shrink-0 rounded-full bg-primary sm:mt-0" />
                      <span className="min-w-0 leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="max-w-3xl">
          <div className="mb-5 space-y-1.5 text-white/90 sm:mb-10 sm:space-y-4">
            <div className="space-y-1.5 sm:hidden">
              {benefitsMobile.map((benefit, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="mt-1.5 h-1 w-2.5 shrink-0 rounded-full bg-primary" />
                  <p className="min-w-0 break-words text-[13px] leading-snug">{benefit}</p>
                </div>
              ))}
            </div>
            <div className="hidden space-y-4 sm:block">
              {dictionary.hero.benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="h-1 w-6 shrink-0 rounded-full bg-primary" />
                  <p className="min-w-0 text-base leading-snug">{benefit}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6 flex flex-col gap-2 sm:mb-0 sm:flex-row sm:gap-4">
            <Button
              variant="consultation"
              size="lg"
              className="h-11 w-full px-4 text-sm sm:h-[56px] sm:w-auto sm:px-8 sm:text-base"
              asChild
            >
              <a
                href={dictionary.global.tgLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full w-full items-center justify-center"
                aria-label="Получить консультацию в Telegram"
              >
                <MessageCircle className="mr-2 h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
                <span className="truncate">{dictionary.hero.cta}</span>
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 w-full border-white bg-transparent px-4 text-sm text-white hover:bg-white/10 hover:text-white sm:h-[56px] sm:w-auto sm:px-8 sm:text-base"
              asChild
            >
              <a href="/avto/" className="flex h-full w-full items-center justify-center">
                <span>Каталог авто</span>
                <ArrowRight className="ml-2 h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 w-full border-white/50 bg-transparent px-4 text-sm text-white hover:bg-white/10 hover:text-white sm:h-[56px] sm:w-auto sm:px-8 sm:text-base"
              asChild
            >
              <a href="/calculator/" className="flex h-full w-full items-center justify-center">
                Калькулятор
              </a>
            </Button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={scrollToContent}
        className="group absolute bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-10 hidden -translate-x-1/2 cursor-pointer flex-col items-center gap-2 p-4 transition-opacity duration-200 hover:opacity-80 sm:bottom-4 sm:flex lg:bottom-6"
        aria-label="Прокрутить вниз"
      >
        <div className="text-xs text-white/60 transition-colors group-hover:text-white/80 sm:text-sm">
          Узнать больше
        </div>
        <div className="flex flex-col items-center">
          <ChevronDown className="h-4 w-4 animate-bounce text-white/60 sm:h-5 sm:w-5" aria-hidden="true" />
          <div className="h-6 w-px bg-gradient-to-b from-white/40 to-transparent sm:h-8" />
        </div>
      </button>
    </section>
  );
};

export default Hero;
