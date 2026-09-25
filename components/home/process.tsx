const steps = [
  { step: "01", title: "Подбор лота", desc: "Фильтры, VIN, Carfax, расчёт ремонта и таможни" },
  { step: "02", title: "Аукцион", desc: "Ставка через брокера MG.GROUP" },
  { step: "03", title: "Логистика США", desc: "Склад → порт → экспортные документы" },
  { step: "04", title: "Море + таможня", desc: "Турция → Новороссийск → Гродно → Минск" },
  { step: "05", title: "Выдача", desc: "Доставка автовозом, СБКТС, помощь с таможней" },
];

export function Process() {
  return (
    <section className="bg-bg-base py-14 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="lux-kicker">Процесс</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              От аукциона до ключей
            </h2>
          </div>
          <p className="max-w-sm text-sm text-text-secondary">
            Средний срок — 2–3 месяца. Каждый этап фиксируется в личном кабинете с фото и документами.
          </p>
        </div>

        <div className="mt-10 grid items-stretch gap-4 sm:mt-14 sm:gap-6 md:grid-cols-5">
          {steps.map((item, i) => (
            <div key={item.step} className="relative h-full">
              {i < steps.length - 1 && (
                <div className="process-line absolute left-1/2 top-8 hidden h-px w-full md:block" />
              )}
              <div className="card-premium reveal-on-scroll relative flex h-full flex-col rounded-2xl p-5 sm:p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-accent/10 font-display text-xs font-bold text-accent">
                  {item.step}
                </span>
                <h3 className="mt-4 font-display text-sm font-semibold">{item.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-text-muted">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
