import { GetStaticProps } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { CustomsCalculator } from "@/components/pricing/customs-calculator";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

export default function CustomsCalculatorPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Таможенный калькулятор растаможки авто в Беларусь 2026 | MG.GROUP",
            description:
              "Онлайн-калькулятор растаможки авто в Беларусь на 2026 год: пошлина, НДС, утильсбор и таможенный сбор для физлиц и юрлиц, электро и EREV, льгота 50% по Указу №140.",
          },
        }}
        lang="ru"
        path="/calculator/rastamozhka/"
      />
      <PageShell
        title="Таможенный калькулятор"
        description="Растаможка авто в Беларусь: все платежи, пошлины и сборы по курсу НБРБ."
      >
        <CustomsCalculator />
        <CustomsInfo />
        <p className="mt-8 text-sm text-text-muted">
          <Link href="/calculator/usa/" className="font-medium text-accent-dark underline underline-offset-2">
            США
          </Link>
          {" · "}
          <Link href="/calculator/angliya/" className="font-medium text-accent-dark underline underline-offset-2">
            Англия
          </Link>
          {" · "}
          <Link href="/calculator/vosstanovlenie/" className="font-medium text-accent-dark underline underline-offset-2">
            Восстановление
          </Link>
        </p>
      </PageShell>
    </>
  );
}

function CustomsInfo() {
  const blocks: { title: string; body: ReactNode }[] = [
    {
      title: "Как пользоваться калькулятором",
      body: (
        <>
          Укажите стоимость авто в евро, точный объём двигателя в см³, кто растаможивает — физлицо или
          юрлицо — и возраст авто. Расчёт обновляется сразу. Доставку можно добавить, чтобы увидеть
          полную стоимость под ключ.
        </>
      ),
    },
    {
      title: "Как определить возраст авто",
      body: (
        <>
          Возраст считается от даты выпуска, а не от первой регистрации. В объявлениях дату выпуска
          часто не указывают — её можно узнать по VIN у официального дилера или в онлайн-сервисах
          производителя.
        </>
      ),
    },
    {
      title: "Самые выгодные ставки для физлиц",
      body: (
        <>
          Для физлица дешевле всего растаможить авто в возрасте от 3 до 5 лет: пошлина считается только
          от объёма двигателя, без привязки к цене. Для авто младше 3 лет берётся большее из процента от
          стоимости и ставки за см³.
        </>
      ),
    },
    {
      title: "Льгота 50% по Указу №140",
      body: (
        <>
          По{" "}
          <a
            href="https://president.gov.by/bucket/assets/uploads/documents/2019/140uk.pdf"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent-dark underline underline-offset-2"
          >
            Указу №140 от 10.04.2019
          </a>{" "}
          физлица, постоянно проживающие в Беларуси, — родители в многодетных семьях и инвалиды I и II
          группы — получают возмещение 50% таможенных пошлин и налогов при ввозе авто.
        </>
      ),
    },
  ];
  return (
    <section className="mt-10 grid gap-4 sm:grid-cols-2" aria-label="Пояснения к расчёту">
      {blocks.map((b) => (
        <article key={b.title} className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="font-display text-base font-semibold text-stone-950">{b.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">{b.body}</p>
        </article>
      ))}
    </section>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
