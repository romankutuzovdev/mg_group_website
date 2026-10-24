import Image from "next/image";
import Link from "next/link";

const DIRECTIONS = [
  {
    n: "01",
    title: "Авто под заказ",
    text: "США, Китай, Корея. Подбор, ставка, море и таможня — до ключей в руках.",
    href: "/avto/",
    image: "/services/catalog-mid.jpg",
    imageAlt: "Автомобиль среднего класса под заказ",
    featured: true,
  },
  {
    n: "02",
    title: "Машинокомплекты",
    text: "Доноры с Copart, IAAI и Copart UK. Штучно и оптом — в разборку под ваш бланк.",
    href: "/mashinokomplekt/",
    image: "/services/usa-mid.jpg",
    imageAlt: "Кроссовер для машинокомплекта",
    featured: false,
  },
  {
    n: "03",
    title: "Спецтехника",
    text: "Гидроциклы, квадроциклы, лодки, строительная техника — отдельным запросом.",
    href: "/contacts/",
    image: "/services/asia-mid.jpg",
    imageAlt: "Техника под заказ",
    featured: false,
  },
] as const;

/**
 * Editorial directions — photo-led, asymmetric, no icon cards.
 */
export function HomeDirections() {
  const [featured, ...rest] = DIRECTIONS;

  return (
    <section
      className="relative border-b border-white/10 bg-[#070707] text-white"
      aria-label="Направления"
    >
      <div className="mx-auto max-w-[1400px] px-4 pt-16 sm:px-6 sm:pt-20 lg:px-10 lg:pt-24">
        <div className="grid gap-10 border-b border-white/10 pb-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-16 lg:pb-14">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/40">
              Направления
            </p>
            <h2 className="mt-4 max-w-[11ch] font-display text-[clamp(2.75rem,7vw,5.5rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-white">
              Что привезём
              <span className="mt-1 block text-white/35">под ключ</span>
            </h2>
          </div>
          <p className="max-w-md text-[15px] leading-relaxed text-white/55 sm:text-base lg:justify-self-end lg:pb-2 lg:text-right">
            Три линии. Один контур сделки: подбор, проверка, логистика, растаможка.
          </p>
        </div>

        <div className="grid gap-3 py-3 sm:gap-4 sm:py-4 lg:grid-cols-12 lg:gap-4 lg:py-5">
          <DirectionPanel item={featured} className="min-h-[420px] sm:min-h-[520px] lg:col-span-7 lg:min-h-[640px]" />
          <div className="grid gap-3 sm:gap-4 lg:col-span-5 lg:grid-rows-2">
            {rest.map((item) => (
              <DirectionPanel
                key={item.n}
                item={item}
                className="min-h-[260px] sm:min-h-[280px] lg:min-h-0"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DirectionPanel({
  item,
  className,
}: {
  item: (typeof DIRECTIONS)[number];
  className?: string;
}) {
  return (
    <Link
      href={item.href}
      className={`group relative isolate block overflow-hidden bg-[#0c0c0c] outline-none ring-1 ring-inset ring-white/[0.08] transition duration-500 hover:ring-white/25 focus-visible:ring-2 focus-visible:ring-primary ${className ?? ""}`}
    >
      <Image
        src={item.image}
        alt={item.imageAlt}
        fill
        className="object-cover opacity-80 transition duration-[1.1s] ease-out group-hover:scale-[1.04] group-hover:opacity-95"
        sizes="(max-width: 1024px) 100vw, 60vw"
        quality={88}
      />

      {/* Film grade — not neon glow */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/15" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-8 lg:p-9">
        <div className="flex items-start justify-between gap-4">
          <span className="font-mono text-[11px] tracking-[0.28em] text-white/35">
            {item.n}
          </span>
          <span className="h-px w-10 origin-right scale-x-100 bg-white/25 transition duration-500 group-hover:w-16 group-hover:bg-primary" />
        </div>

        <div className="max-w-md translate-y-1 transition duration-500 ease-out group-hover:translate-y-0">
          <h3
            className={`font-display font-semibold tracking-[-0.03em] text-white ${
              item.featured
                ? "text-[clamp(2rem,4vw,3.25rem)] leading-[1.02]"
                : "text-[clamp(1.5rem,2.5vw,2rem)] leading-[1.08]"
            }`}
          >
            {item.title}
          </h3>
          <p
            className={`mt-3 leading-relaxed text-white/65 ${
              item.featured ? "max-w-sm text-[15px] sm:text-base" : "text-sm sm:text-[15px]"
            }`}
          >
            {item.text}
          </p>
          <span className="mt-6 inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
            Открыть
            <span
              className="inline-block h-px w-6 bg-primary transition-all duration-500 group-hover:w-10"
              aria-hidden
            />
          </span>
        </div>
      </div>
    </Link>
  );
}
