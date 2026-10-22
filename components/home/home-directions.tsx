import { Car, Tractor, Wrench } from "lucide-react";
import Link from "next/link";

const DIRECTIONS = [
  {
    icon: Car,
    title: "Авто под заказ",
    text: "США, Китай, Корея — выгода до 30% от рынка РБ, таможня под ключ.",
    href: "/avto/",
    tone: "from-emerald-950 via-stone-900 to-stone-950",
    glow: "rgba(34,197,94,0.35)",
    chip: "Каталог",
  },
  {
    icon: Wrench,
    title: "Машинокомплекты",
    text: "Оригинальные комплекты и двигатели из США и Англии — штучно и оптом.",
    href: "/mashinokomplekt/",
    tone: "from-stone-900 via-zinc-900 to-emerald-950",
    glow: "rgba(52,211,153,0.28)",
    chip: "Комплекты",
  },
  {
    icon: Tractor,
    title: "Спецтехника",
    text: "Гидроциклы, квадроциклы, лодки и строительная техника.",
    href: "/contacts/",
    tone: "from-neutral-950 via-stone-900 to-lime-950",
    glow: "rgba(163,230,53,0.22)",
    chip: "Заявка",
  },
] as const;

/** Rich direction panels — not flat white cards. */
export function HomeDirections() {
  return (
    <section
      className="relative overflow-hidden border-b border-stone-800 bg-stone-950 py-14 md:py-20"
      aria-label="Направления"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_50%_-10%,rgba(34,197,94,0.16),transparent_55%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-2 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Направления</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
              Что привезём под ключ
            </h2>
          </div>
          <p className="max-w-sm text-base text-white/60">
            Один процесс: подбор, проверка, логистика и растаможка.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          {DIRECTIONS.map((item, i) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href + item.title}
                href={item.href}
                className={`group relative cursor-pointer overflow-hidden rounded-3xl bg-gradient-to-br ${item.tone} p-6 ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:ring-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-7`}
                style={{
                  boxShadow: `0 30px 80px -40px ${item.glow}`,
                  animationDelay: `${80 + i * 70}ms`,
                }}
              >
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-60 blur-3xl transition group-hover:opacity-90"
                  style={{ background: item.glow }}
                  aria-hidden
                />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-primary ring-1 ring-white/15 backdrop-blur-md transition group-hover:bg-primary group-hover:text-stone-950">
                    <Icon className="h-6 w-6" aria-hidden />
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 ring-1 ring-white/15">
                    {item.chip}
                  </span>
                </div>
                <h3 className="relative mt-6 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {item.title}
                </h3>
                <p className="relative mt-3 text-base leading-relaxed text-white/70">{item.text}</p>
                <span className="relative mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary transition group-hover:gap-3">
                  Смотреть
                  <span aria-hidden>→</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
