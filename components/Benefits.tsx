import type { Dictionary } from "@/lib/dictionary";

interface BenefitsProps {
  dictionary: Dictionary;
}

/**
 * Editorial advantages — typography-led, no icon boxes / timeline AI pattern.
 */
const Benefits = ({ dictionary }: BenefitsProps) => {
  const items = dictionary.benefits.items;

  return (
    <section
      id="benefits"
      className="relative overflow-hidden border-y border-stone-200 bg-[#f3f1ec] text-stone-950"
      aria-labelledby="benefits-heading"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_0%_0%,rgba(34,197,94,0.07),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(120deg,transparent,rgba(28,25,23,0.03))]" />

      <div className="relative mx-auto max-w-[1400px] px-4 py-16 sm:px-6 sm:py-20 lg:px-10 lg:py-28">
        <div className="grid gap-12 border-b border-stone-900/10 pb-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-end lg:gap-20 lg:pb-16">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-stone-500">
              Почему MG.GROUP
            </p>
            <h2
              id="benefits-heading"
              className="mt-4 max-w-[12ch] font-display text-[clamp(2.4rem,6vw,4.75rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-stone-950"
            >
              {dictionary.benefits.title}
            </h2>
          </div>
          <p className="max-w-md text-[15px] leading-relaxed text-stone-600 sm:text-base lg:justify-self-end lg:pb-3 lg:text-right">
            Три принципа сделки: отбор лота, маршрут без сюрпризов и прозрачные условия до выдачи.
          </p>
        </div>

        <ol className="divide-y divide-stone-900/10">
          {items.map((item, index) => (
            <li
              key={item.number}
              className="group relative grid gap-6 py-10 sm:gap-8 sm:py-12 lg:grid-cols-[7rem_1fr_minmax(0,22rem)] lg:items-start lg:gap-12 lg:py-14"
            >
              <div className="flex items-baseline gap-3 lg:block">
                <span className="font-mono text-[11px] tracking-[0.28em] text-stone-400 transition group-hover:text-primary">
                  {item.number}
                </span>
                <span
                  className="hidden font-display text-[clamp(3.5rem,8vw,6.5rem)] font-semibold leading-none tracking-[-0.06em] text-stone-950/[0.06] transition duration-500 group-hover:text-primary/15 lg:mt-3 lg:block"
                  aria-hidden
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>

              <div>
                <h3 className="max-w-xl font-display text-[clamp(1.6rem,3.2vw,2.55rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-stone-950">
                  <span className="normal-case">
                    {toTitleCase(item.title)}{" "}
                  </span>
                  <span className="text-primary">{toTitleCase(item.highlight)}</span>
                </h3>
                <div className="mt-5 h-px w-12 origin-left bg-stone-900/20 transition duration-500 group-hover:w-20 group-hover:bg-primary" />
              </div>

              <p className="max-w-md text-[15px] leading-relaxed text-stone-600 sm:text-base lg:pt-2">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

function toTitleCase(value: string) {
  const lower = value.toLocaleLowerCase("ru-RU");
  return lower.charAt(0).toLocaleUpperCase("ru-RU") + lower.slice(1);
}

export default Benefits;
