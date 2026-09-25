import { CountUp } from "@/components/fx/count-up";

const stats = [
  { label: "выгода vs рынок РБ" },
  { value: "США · Китай · Корея", label: "авто под заказ" },
  { value: "США · Англия", label: "машинокомплекты" },
  { value: "9:00–19:00", label: "будни, Гродно" },
];

export function StatsBar() {
  return (
    <section className="border-y border-border bg-bg-base py-8 md:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
          <div className="card-premium reveal-on-scroll rounded-xl p-4 text-center md:p-6 md:text-left">
            <p className="font-display text-lg font-semibold text-accent-dark md:text-2xl">
              <CountUp prefix="до " value={30} suffix="%" />
            </p>
            <p className="mt-1 text-xs text-text-secondary sm:text-sm">{stats[0].label}</p>
          </div>
          {stats.slice(1).map((stat) => (
            <div
              key={stat.label}
              className="card-premium reveal-on-scroll rounded-xl p-4 text-center md:p-6 md:text-left"
            >
              <p className="font-display text-lg font-semibold text-accent-dark md:text-2xl">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-text-secondary sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
