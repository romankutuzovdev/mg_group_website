import { GetStaticProps } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, LockKeyhole } from "lucide-react";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { CatalogHero } from "@/components/catalog/catalog-hero";
import { CalculatorGate } from "@/components/pricing/calculator-gate";
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
    number: "01",
    kicker: "Машинокомплект",
    layout: "lg:col-span-7",
  },
  {
    href: "/calculator/angliya/",
    title: "Англия",
    text: "Машинокомплект из Англии: только Copart UK.",
    image: "/calculator/angliya.jpg",
    imageAlt: "Автомобиль Англии для калькулятора",
    number: "02",
    kicker: "Машинокомплект",
    layout: "lg:col-span-5",
  },
  {
    href: "/calculator/vosstanovlenie/",
    title: "Восстановление",
    text: "Целое авто из США: IAAI, Bid.cars и Copart.com.",
    image: "/calculator/vosstanovlenie.jpg",
    imageAlt: "Авто под восстановление",
    number: "03",
    kicker: "Целый автомобиль",
    layout: "lg:col-span-5",
  },
  {
    href: "/calculator/rastamozhka/",
    title: "Растаможка",
    text: "Пошлина и утильсбор в Беларусь.",
    image: "/calculator/rastamozhka.jpg",
    imageAlt: "Таможня и логистика",
    number: "04",
    kicker: "Беларусь",
    layout: "lg:col-span-7",
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
      <PageShell bare className="!max-w-none !p-0">
        <CatalogHero
          title="Стоимость без сюрпризов"
          description="Рассчитайте доставку, аукционные сборы, разборку и таможенные платежи до начала сделки."
          crumbs={[{ label: "Калькуляторы" }]}
          image="/calculator/vosstanovlenie.jpg"
          ctas={[
            { href: "#calculators", label: "Выбрать расчёт", variant: "primary" },
            { href: "/avto/", label: "Каталог авто", variant: "outline" },
          ]}
          media={
            <div className="min-w-72 text-right" aria-hidden>
              <p className="font-display text-[6.5rem] font-semibold leading-none tracking-[-0.07em] text-white/10">01—04</p>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">Четыре сценария расчёта</p>
            </div>
          }
        />

        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <section id="calculators" className="scroll-mt-24">
            <div className="mb-8 flex flex-col justify-between gap-5 border-b border-stone-200 pb-7 md:flex-row md:items-end">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent-dark">Расчёт под ключ</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-4xl">Выберите сценарий</h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-500 sm:text-base">Отдельная формула для каждого направления — с нужной валютой, сборами площадки и логистикой.</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-stone-500">
                <LockKeyhole className="h-4 w-4 text-accent-dark" aria-hidden />
                Расчёты сохраняются в личном кабинете
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
          {CALCULATORS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative min-h-[22rem] cursor-pointer overflow-hidden rounded-2xl text-white ring-1 ring-inset ring-white/10 transition duration-500 hover:ring-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-[26rem] ${item.layout}`}
            >
              <Image
                src={item.image}
                alt={item.imageAlt}
                fill
                sizes="(max-width: 1024px) 100vw, 58vw"
                className="object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-transparent" />
              <div className="relative z-[1] flex h-full min-h-[22rem] flex-col justify-between p-6 sm:min-h-[26rem] sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <span className="font-mono text-[10px] tracking-[0.28em] text-white/45">{item.number}</span>
                  <ArrowUpRight className="h-5 w-5 text-white/55 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                </div>
                <div className="max-w-lg">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">{item.kicker}</p>
                <h3 className="mt-3 font-display text-3xl font-semibold leading-none tracking-[-0.04em] sm:text-4xl">
                  {item.title}
                </h3>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70 sm:text-base">
                  {item.text}
                </p>
                <span className="mt-6 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                  Открыть калькулятор <span className="h-px w-7 bg-primary transition-all duration-500 group-hover:w-12" aria-hidden />
                </span>
                </div>
              </div>
            </Link>
          ))}
            </div>
          </section>

          <div className="mt-10 grid gap-4 border-y border-stone-200 py-6 text-sm text-stone-600 sm:grid-cols-3">
            {["Актуальные формулы сборов", "Отдельная логистика для каждого рынка", "История расчётов в кабинете"].map((item) => (
              <p key={item} className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-accent-dark" aria-hidden />{item}</p>
            ))}
          </div>

          <section className="py-14 sm:py-20" aria-label="Доступ к калькуляторам">
            <CalculatorGate />
          </section>
        </div>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
