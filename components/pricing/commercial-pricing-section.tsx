"use client";

import { useState } from "react";
import { CommercialPriceModal } from "@/components/pricing/commercial-price-modal";
import { AnchorButton, Button } from "@/components/site/button";
import { CONSULTATION_TG } from "@/lib/company";
import {
  COMMERCIAL_UPDATED,
  type CommercialOrigin,
  WEIGHT_FORMULA,
  DISMANTLE_TARIFFS,
} from "@/lib/pricing/commercial";

export function CommercialPricingSection() {
  const [origin, setOrigin] = useState<CommercialOrigin>("uk");
  const [modalOrigin, setModalOrigin] = useState<CommercialOrigin | null>(null);

  const weight = WEIGHT_FORMULA[origin];
  const tariffs = DISMANTLE_TARIFFS[origin];

  return (
    <>
      <section id="commercial-pricing" className="scroll-mt-28 border-t border-border bg-bg-dark py-14 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="lux-kicker text-accent">Коммерческий прайс</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight text-text-on-dark sm:text-3xl md:text-4xl">
              Машинокомплекты оптом из США и Англии
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-text-on-dark-muted sm:text-base">
              Фиксированный тариф по типу кузова или расчёт по весу — что выгоднее для вашего объёма. Доставка и
              растаможка до Минска уже в тарифе разбора. Актуально от {COMMERCIAL_UPDATED}.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {(
              [
                ["uk", "🇬🇧 Англия"],
                ["usa", "🇺🇸 США"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setOrigin(key)}
                className={`min-h-11 rounded-full px-5 py-2 text-sm font-medium transition ${
                  origin === key
                    ? "bg-accent text-white shadow-[0_8px_24px_-8px_rgba(34,197,94,0.55)]"
                    : "border border-white/15 text-text-on-dark-muted hover:border-accent/40 hover:text-text-on-dark"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-12">
            <article className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/20 via-accent/5 to-transparent p-6 lg:col-span-5 lg:p-8">
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/20 blur-3xl" />
              <div className="relative">
                <span className="inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                  По весу
                </span>
                <h3 className="mt-4 font-display text-xl font-semibold text-text-on-dark sm:text-2xl">
                  Привезём по килограммам
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-text-on-dark-muted">
                  Не подходит фиксированный тариф? Считаем от фактического веса груза — удобно для нестандартных
                  комплектов, агрегатов и смешанных контейнеров.
                </p>
                <p className="mt-6 font-display text-3xl font-bold tabular-nums text-accent sm:text-4xl">
                  {weight.base.toLocaleString("ru-RU")} + {weight.perKg} × кг
                </p>
                <p className="mt-2 text-xs text-text-on-dark-muted">{weight.hint}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-6 border-white/25 text-text-on-dark hover:bg-white/10"
                  onClick={() => setModalOrigin(origin)}
                >
                  Полный прайс {origin === "uk" ? "Англии" : "США"}
                </Button>
              </div>
            </article>

            <article className="rounded-3xl border border-white/10 bg-white/5 p-6 lg:col-span-7 lg:p-8">
              <h3 className="font-display text-lg font-semibold text-text-on-dark">Тарифы разбора до Минска</h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {tariffs.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-bg-dark/40 px-4 py-3"
                  >
                    <span className="text-sm text-text-on-dark-muted">{row.label}</span>
                    <span className="font-display text-lg font-semibold tabular-nums text-text-on-dark">
                      {row.price.toLocaleString("ru-RU")} $
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-text-on-dark-muted">
                Лот + аукцион + доставка по стране + комиссия перевода 3%
                {origin === "usa" ? " + 200 USD диспетчинг по США" : ""}. Самовывоз из Минска возможен.
              </p>
              <button
                type="button"
                onClick={() => setModalOrigin(origin)}
                className="mt-4 text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                Доп. услуги, доставка по США и условия →
              </button>
            </article>
          </div>

          <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-accent/20 bg-accent/5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h3 className="font-display text-xl font-semibold text-text-on-dark">Нужен расчёт под ваш объём?</h3>
              <p className="mt-2 max-w-xl text-sm text-text-on-dark-muted">
                Опишите задачу или комплектацию — посчитаем по тарифу и по весу.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <AnchorButton href={CONSULTATION_TG} target="_blank" rel="noopener noreferrer">
                Запросить расчёт
              </AnchorButton>
              <Button type="button" variant="outline" onClick={() => setModalOrigin(origin)}>
                Открыть прайс
              </Button>
            </div>
          </div>
        </div>
      </section>

      {modalOrigin ? <CommercialPriceModal origin={modalOrigin} onClose={() => setModalOrigin(null)} /> : null}
    </>
  );
}
