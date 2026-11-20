"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { LinkButton } from "@/components/site/button";
import { PagedPicks, SHOWCASE_LIMIT, useShowcase } from "@/components/home/showcase-picks";

/**
 * «Следующая остановка — ваш гараж»: только авто, которые менеджеры добавили
 * «На главную» из калькулятора (последние 36, блоками по 6). Каталог здесь не показываем.
 */
export function HomeShowcase() {
  const { items: picks, loaded } = useShowcase("home", "restoration", SHOWCASE_LIMIT);

  return (
    <section id="catalog-showcase" className="scroll-mt-20 bg-bg-base py-16 sm:py-20 lg:py-24" aria-labelledby="home-showcase-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="lux-kicker">Выбор менеджеров · посчитано под ключ</p>
            <h2 id="home-showcase-title" className="mt-4 font-display text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.06] tracking-tight">Следующая остановка —<br /><span className="text-text-secondary">ваш гараж.</span></h2>
          </div>
          <Link href="/avto/" className="inline-flex min-h-11 w-fit items-center gap-3 text-sm font-medium text-accent-dark underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">Весь каталог <ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
        </div>

        {picks.length ? (
          <PagedPicks items={picks} />
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-stone-950 px-6 py-14 text-center text-white">
            <h3 className="text-xl font-semibold">{loaded ? "Скоро здесь появятся автомобили" : "Загружаем автомобили"}</h3>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-white/85">
              Сюда менеджеры добавляют машины, которые посчитали под ключ. Оставьте пожелания к модели и бюджету — подберём вариант.
            </p>
            <LinkButton href="#car-finder" variant="secondary" className="mt-6">Заказать подбор</LinkButton>
          </div>
        )}

        <div className="mt-8 flex flex-col justify-between gap-5 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="max-w-lg text-xs leading-relaxed text-text-secondary">Авто под восстановление, которые менеджеры посчитали в калькуляторе: ставка и итог под ключ. Итог зависит от ставки, логистики и таможенных платежей.</p>
          <LinkButton href="/avto/" variant="secondary" className="shrink-0">Весь каталог <ArrowRight className="h-4 w-4" aria-hidden /></LinkButton>
        </div>
      </div>
    </section>
  );
}
