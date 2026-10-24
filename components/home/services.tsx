import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

type ServiceCard = {
  title: string;
  description: string;
  tag: string;
  href: string;
  image: string;
  imageAlt: string;
  layout: string;
  minH: string;
};

const services: ServiceCard[] = [
  {
    title: "Каталог авто",
    description:
      "США, Китай, Корея и Англия в одном каталоге: марки, модели, ставка и просчёт под ключ.",
    tag: "01",
    href: "/avto/",
    image: "/services/cycle/01.jpg",
    imageAlt: "Hyundai — авто среднего класса",
    layout: "lg:col-span-7 lg:row-span-2",
    minH: "min-h-[340px] sm:min-h-[420px] lg:min-h-full",
  },
  {
    title: "Машинокомплекты с аукционов",
    description:
      "Доноры Copart / IAAI / Copart UK под разборку. Ставки, расчёт и доставка комплектом в РБ.",
    tag: "02",
    href: "/mashinokomplekt/",
    image: "/services/mashinokomplekt-mid.jpg",
    imageAlt: "Nissan Juke — кроссовер среднего класса",
    layout: "lg:col-span-5",
    minH: "min-h-[240px] sm:min-h-[280px]",
  },
  {
    title: "Авто из США",
    description: "Лоты Copart и IAAI со ставкой и просчётом под ключ.",
    tag: "03",
    href: "/avto/usa/",
    image: "/services/cycle/05.jpg",
    imageAlt: "Ford Mustang — популярный сегмент США",
    layout: "lg:col-span-5",
    minH: "min-h-[240px] sm:min-h-[280px]",
  },
  {
    title: "Купленные машинокомплекты",
    description: "Примеры доноров с разбором: ставка, доставка и итог из калькулятора.",
    tag: "04",
    href: "/kuplennye-mashinokomplekty/",
    image: "/services/cycle/02.jpg",
    imageAlt: "Fiat 500 — компактный сегмент",
    layout: "lg:col-span-5",
    minH: "min-h-[260px] sm:min-h-[300px]",
  },
  {
    title: "Авто из Кореи и Китая",
    description: "Encar и китайский рынок — тот же каталог марок, моделей и лотов.",
    tag: "05",
    href: "/avto/",
    image: "/calculator/angliya.jpg",
    imageAlt: "Авто из азиатского и европейского рынка",
    layout: "lg:col-span-7",
    minH: "min-h-[260px] sm:min-h-[300px]",
  },
];

export function Services() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 bg-black py-16 md:py-28">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_480px_at_12%_-8%,rgba(34,197,94,0.14),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_360px_at_88%_18%,rgba(255,255,255,0.06),transparent_50%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
              Услуги
            </p>
            <h2 className="mt-4 font-display text-[clamp(2rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-tight text-white">
              Полный цикл — одна команда
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
              Не просто логистика. MG.GROUP сопровождает сделку от подбора до выдачи и помогает с
              таможенным оформлением.
            </p>
          </div>
          <Link
            href="/avto/"
            className="group inline-flex items-center gap-2 self-start text-sm font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:text-white lg:self-end"
          >
            Все направления
            <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <div className="mt-12 grid gap-3 sm:mt-16 sm:gap-4 lg:grid-cols-12 lg:grid-rows-[minmax(280px,1fr)_minmax(280px,1fr)_minmax(280px,auto)]">
          {services.map((service) => (
            <Link
              key={service.tag}
              href={service.href}
              className={`group relative isolate overflow-hidden rounded-[1.35rem] ring-1 ring-white/10 transition duration-500 hover:ring-primary/40 ${service.layout} ${service.minH}`}
            >
              <Image
                src={service.image}
                alt={service.imageAlt}
                fill
                className="object-cover transition duration-700 ease-out group-hover:scale-105"
                sizes="(max-width: 1024px) 100vw, 60vw"
                quality={85}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent opacity-80" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(34,197,94,0.18),transparent_45%)] opacity-0 transition duration-500 group-hover:opacity-100" />

              <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <span className="font-display text-sm font-semibold tracking-[0.22em] text-white/45">
                    {service.tag}
                  </span>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white opacity-0 backdrop-blur-md transition duration-300 group-hover:opacity-100">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>

                <div className="max-w-md translate-y-1 transition duration-500 group-hover:translate-y-0">
                  <h3 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    {service.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">
                    {service.description}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    Смотреть
                    <span
                      className="transition-transform duration-300 group-hover:translate-x-1"
                      aria-hidden
                    >
                      →
                    </span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
