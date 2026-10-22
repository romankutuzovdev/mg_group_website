import { CountUp } from "@/components/fx/count-up";

const stats = [
  { label: "выгода vs рынок РБ" },
  { value: "США · Китай · Корея", label: "авто под заказ" },
  { value: "США · Англия", label: "машинокомплекты" },
  { value: "9:00–19:00", label: "будни, Гродно" },
];

export function StatsBar() {
  return (
    <section className="relative overflow-hidden border-y border-stone-200/80 bg-stone-950 py-10 text-white md:py-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_280px_at_20%_0%,rgba(34,197,94,0.18),transparent)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">
          Цифры и география
        </p>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
          <div className="border-l border-primary/40 pl-4">
            <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
              <CountUp prefix="до " value={30} suffix="%" />
            </p>
            <p className="mt-2 text-xs text-white/55 sm:text-sm">{stats[0].label}</p>
          </div>
          {stats.slice(1).map((stat) => (
            <div key={stat.label} className="border-l border-white/15 pl-4">
              <p className="font-display text-xl font-semibold tracking-tight text-white md:text-2xl">
                {stat.value}
              </p>
              <p className="mt-2 text-xs text-white/55 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
