import { GetStaticProps } from "next";
import Image from "next/image";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { CalculatorGate } from "@/components/pricing/calculator-gate";
import { QuoteHistoryPanel } from "@/components/cabinet/quote-history-panel";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

const CALCULATORS = [
  {
    href: "/calculator/usa/",
    title: "США",
    text: "Машинокомплект из США: IAAI, Bid.cars и Copart.com.",
    image: "/calculator/usa.jpg",
    imageAlt: "Автомобиль США для калькулятора",
  },
  {
    href: "/calculator/angliya/",
    title: "Англия",
    text: "Машинокомплект из Англии: только Copart UK.",
    image: "/calculator/angliya.jpg",
    imageAlt: "Автомобиль Англии для калькулятора",
  },
  {
    href: "/calculator/vosstanovlenie/",
    title: "Восстановление",
    text: "Целое авто из США: IAAI, Bid.cars и Copart.com.",
    image: "/calculator/vosstanovlenie.jpg",
    imageAlt: "Авто под восстановление",
  },
  {
    href: "/calculator/rastamozhka/",
    title: "Растаможка",
    text: "Пошлина и утильсбор в Беларусь.",
    image: "/calculator/rastamozhka.jpg",
    imageAlt: "Таможня и логистика",
  },
] as const;

export default function CalculatorHubPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Калькуляторы MG.GROUP | США, Англия, восстановление, растаможка",
            description:
              "Отдельные калькуляторы: машинокомплект США, машинокомплект Англия, авто под восстановление и растаможка.",
          },
        }}
        lang="ru"
        path="/calculator/"
      />
      <PageShell
        title="Калькуляторы"
        description="После входа: машинокомплект США и Англия, авто под восстановление и растаможка."
        className="!pt-4 sm:!pt-5"
      >
        {/* Плашки всегда сверху — до формы входа */}
        <div className="mb-5 mx-auto grid max-w-5xl grid-cols-4 gap-2 sm:mb-6 sm:gap-3.5">
          {CALCULATORS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-stone-200 text-white shadow-[0_18px_40px_-28px_rgba(28,25,23,0.55)] transition hover:-translate-y-0.5 hover:border-primary/40 sm:rounded-xl"
            >
              <Image
                src={item.image}
                alt={item.imageAlt}
                fill
                sizes="(max-width: 640px) 25vw, 240px"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/30" />
              <div className="relative z-[1] flex h-full flex-col justify-end p-1.5 sm:p-3 md:p-4">
                <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-primary sm:text-[10px] md:text-[11px]">
                  MG.GROUP
                </p>
                <h2 className="mt-0.5 text-[11px] font-semibold leading-tight tracking-tight sm:mt-1 sm:text-base md:text-xl">
                  {item.title}
                </h2>
                <p className="mt-0.5 hidden text-xs leading-snug text-white/80 sm:mt-1 sm:line-clamp-2 sm:block md:line-clamp-3 md:text-sm">
                  {item.text}
                </p>
                <span className="mt-1 inline-flex text-[10px] font-semibold text-primary sm:mt-2 sm:text-xs md:text-sm">
                  Открыть →
                </span>
              </div>
            </Link>
          ))}
        </div>

        <CalculatorGate showOverview>
          <div className="mt-2">
            <QuoteHistoryPanel scope="mine" />
          </div>
        </CalculatorGate>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
