import { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

export default function CookiesPolicyPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Политика cookies | MG.GROUP",
            description:
              "Как сайт MG.GROUP использует cookies и локальное хранилище браузера. Согласие пользователя и управление настройками.",
          },
        }}
        lang="ru"
        path="/cookies/"
      />
      <PageShell
        title="Политика cookies"
        description="Какие данные сохраняет браузер и зачем нужно ваше согласие."
      >
        <article className="mx-auto max-w-3xl space-y-6 text-[15px] leading-relaxed text-zinc-700">
          <p className="text-sm text-zinc-500">Обновлено: 30 сентября 2026 г.</p>

          <p>
            Настоящая политика объясняет, какие cookies и похожие технологии использует сайт{" "}
            <strong>MG.GROUP</strong> (mg-group.by) и зачем они нужны. Продолжая пользоваться
            сайтом после показа баннера согласия, вы подтверждаете, что ознакомились с этой
            информацией.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">1. Что такое cookies</h2>
            <p className="mt-2">
              Cookies — небольшие файлы, которые сайт может сохранять в браузере. К похожим
              технологиям относятся <em>localStorage</em> и <em>sessionStorage</em>: они тоже
              хранят данные на вашем устройстве, чтобы сайт работал удобнее.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">2. Зачем мы их используем</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                <strong>Необходимые</strong> — вход в личный кабинет (токен авторизации),
                сохранение согласия на cookies, корректная работа форм и каталога.
              </li>
              <li>
                <strong>Функциональные</strong> — запоминание фильтров и позиции в каталоге при
                переходе на карточку лота и обратно.
              </li>
              <li>
                <strong>Технические</strong> — стабильная работа сайта и защита сессии.
              </li>
            </ul>
            <p className="mt-2">
              Мы не используем cookies для показа сторонней рекламы и не продаём ваши данные
              рекламным сетям.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">3. Согласие</h2>
            <p className="mt-2">
              При первом визите показывается баннер. Нажатие «Принимаю» сохраняет согласие в
              браузере. Без согласия сайт может работать ограниченно (например, без сохранения
              входа в кабинет между сессиями).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">4. Как отозвать или удалить</h2>
            <p className="mt-2">
              Вы можете очистить cookies и данные сайтов в настройках браузера. После очистки
              баннер согласия появится снова при следующем визите.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">5. Контакты</h2>
            <p className="mt-2">
              Вопросы по обработке данных и cookies:{" "}
              <a
                href="/contacts/"
                className="font-medium text-[#1B5E20] underline underline-offset-2"
              >
                страница контактов
              </a>{" "}
              или телефоны, указанные в подвале сайта.
            </p>
          </section>
        </article>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: {
    dictionary: getDictionary(),
  },
});
