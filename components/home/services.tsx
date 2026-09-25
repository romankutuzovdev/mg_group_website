import Link from "next/link";

const services: {
  title: string;
  description: string;
  tag: string;
  span: string;
  href?: string;
}[] = [
  {
    title: "Каталог авто",
    description:
      "США, Китай, Корея и Англия в одном каталоге: марки, модели, ставка и просчёт под ключ.",
    tag: "01",
    span: "lg:col-span-2",
    href: "/avto/",
  },
  {
    title: "Машинокомплекты с аукционов",
    description:
      "Доноры Copart / IAAI / Copart UK под разборку. Ставки, расчёт и доставка комплектом в РБ.",
    tag: "02",
    span: "",
    href: "/mashinokomplekt/",
  },
  {
    title: "Авто из США",
    description: "Лоты Copart и IAAI со ставкой и просчётом под ключ.",
    tag: "03",
    span: "",
    href: "/avto/usa/",
  },
  {
    title: "Купленные машинокомплекты",
    description: "Примеры доноров с разбором: ставка, доставка и итог из калькулятора.",
    tag: "04",
    span: "",
    href: "/kuplennye-mashinokomplekty/",
  },
  {
    title: "Авто из Кореи и Китая",
    description: "Encar и китайский рынок — тот же каталог марок, моделей и лотов.",
    tag: "05",
    span: "lg:col-span-2",
    href: "/avto/",
  },
];

export function Services() {
  return (
    <section className="border-t border-border bg-bg-base py-14 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="lux-kicker">Услуги</p>
          <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
            Полный цикл — одна команда
          </h2>
          <p className="mt-4 text-sm text-text-secondary sm:text-base">
            Не просто логистика. MG.GROUP сопровождает сделку от подбора до выдачи и помогает с таможенным оформлением.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:mt-14 lg:grid-cols-3">
          {services.map((service) => {
            const card = (
              <>
                <span className="font-display text-5xl font-bold text-black/[0.04] transition group-hover:text-accent/15">
                  {service.tag}
                </span>
                <h3 className="mt-4 font-display text-xl font-semibold">{service.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                  {service.description}
                </p>
                <div className="absolute bottom-0 left-0 h-px w-0 bg-gradient-to-r from-accent to-transparent transition-all duration-500 group-hover:w-full" />
              </>
            );
            const className = `card-premium reveal-on-scroll group relative overflow-hidden rounded-2xl p-6 sm:p-8 ${service.span}`;

            return service.href ? (
              <Link key={service.tag} href={service.href} className={`${className} block`}>
                {card}
              </Link>
            ) : (
              <article key={service.tag} className={className}>
                {card}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
