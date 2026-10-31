import { GetStaticProps } from "next";
import Image from "next/image";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { AnchorButton, LinkButton } from "@/components/site/button";
import { getDictionary, type Dictionary } from "@/lib/dictionary";
import { CONSULTATION_TG } from "@/lib/company";

const INCLUDED = [
  "Двигатель с навесным оборудованием",
  "Коробка передач",
  "Подвеска, рычаги и приводы",
  "Рулевая колонка",
  "Двери, капот, крылья и другие кузовные элементы",
  "Катализаторы",
  "Колёса",
];

const EXCLUDED = ["Сиденья", "Аккумулятор", "Бензобак"];

const SCHEMES = [
  {
    code: "МШК",
    title: "Машинокомплект",
    text: "Полный разбор донора по бланку: кузов, двигатель, коробка и ходовая.",
  },
  {
    code: "П/К",
    title: "Полукомплект",
    text: "Урезанный набор узлов, если целый комплект не нужен.",
  },
  {
    code: "НСК",
    title: "Ноускат",
    text: "Передняя часть: двигатель, коробка и передняя подвеска.",
  },
  {
    code: "ДВС",
    title: "Моторокомплект",
    text: "Двигатель с проверкой до снятия. Перед разбором его запускают и снимают видео.",
  },
];

const STEPS = [
  "Подбираем донора на Copart, IAAI или Copart UK под ваш бланк.",
  "Согласуем, что входит в комплект и от чего отказываемся. Это сразу меняет цену.",
  "Выкупаем лот и везём машину на разборку.",
  "Разбираем по бланку и фиксируем процесс фото и видео.",
  "Пакуем узлы и отправляем: из США морем, из Англии по суше.",
];

interface Props {
  dictionary: Dictionary;
}

export default function WhatIsKitPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Что такое машинокомплект | MG.GROUP",
            description:
              "Машинокомплект — автомобиль с аукциона США или Англии, разобранный по бланку. Что входит, чего нет, схемы МШК, полукомплект, ноускат и мотор.",
          },
        }}
        lang="ru"
        path="/mashinokomplekt/chto-takoe/"
        image="/kits/mashinokomplekt-cutaway.jpg"
      />

      <PageShell bare>
        <section className="border-b border-border bg-stone-950 text-white">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Машинокомплекты
              </p>
              <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Что такое машинокомплект
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
                Это не готовая машина под учёт. Донора выкупают на аукционе в США или Англии,
                разбирают по бланку и везут набором узлов.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <LinkButton href="/mashinokomplekt/">Смотреть лоты</LinkButton>
                <AnchorButton
                  href={CONSULTATION_TG}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outline"
                >
                  Заказать комплект
                </AnchorButton>
              </div>
            </div>
            <figure className="min-w-0 overflow-hidden rounded-2xl bg-[#2a2f36]">
              <Image
                src="/kits/mashinokomplekt-cutaway.jpg"
                alt="Донор Mercedes-AMG: двигатель, подвеска и кузов до разборки на машинокомплект"
                width={1600}
                height={900}
                priority
                className="h-auto w-full"
              />
            </figure>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Что входит в стандартный комплект
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary sm:text-base">
                Точный список фиксирует бланк разборки. В стандартный машинокомплект входят
                кузовные элементы и катализаторы. Обычно в том же бланке ещё двигатель, коробка
                и ходовая — то, что видно на разрезе донора.
              </p>
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li
                    key={item}
                    className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-zinc-800"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-white p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold">Чего в стандарте нет</h2>
              <ul className="mt-4 space-y-2 text-sm text-text-secondary">
                {EXCLUDED.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                Стёкла везём, но без гарантии. Сиденья, проводку, обшивку и другие позиции можно
                добавить в бланк отдельно — это сразу меняет стоимость.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                Перед разборкой фиксируем машину фото и видео. Хрупкие узлы пакуем отдельно.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Четыре схемы разборки
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SCHEMES.map((scheme) => (
                <article key={scheme.code} className="rounded-2xl border border-border p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-dark">
                    {scheme.code}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-semibold">{scheme.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{scheme.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Как проходит заказ
            </h2>
            <ol className="mt-6 space-y-4">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed text-zinc-800 sm:text-base">
                  <span className="font-display text-sm font-semibold text-accent-dark">
                    0{index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-4">
            <article className="rounded-2xl border border-border bg-white p-6">
              <h3 className="font-display text-lg font-semibold">Из США</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Аукцион, разбор в Нью-Джерси или Техасе, море через Турцию и Новороссийск, дальше
                фура на Гродно и Минск.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-white p-6">
              <h3 className="font-display text-lg font-semibold">Из Англии</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Copart UK, разбор у Лондона, дальше суша через Францию на Гродно и Минск.
              </p>
            </article>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/calculator/mashinokomplekt/">Калькулятор комплекта</LinkButton>
              <Link
                href="/faq/"
                className="inline-flex min-h-11 items-center text-sm font-medium text-accent-dark underline underline-offset-2"
              >
                Вопросы о комплекте
              </Link>
            </div>
          </div>
        </section>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: { dictionary: getDictionary() },
});
