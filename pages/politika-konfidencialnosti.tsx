import { GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { COMPANY, PHONES } from "@/lib/company";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";

interface Props {
  dictionary: Dictionary;
}

export default function PrivacyPolicyPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Политика конфиденциальности | MG.GROUP",
            description:
              "Политика обработки персональных данных клиентов MG.GROUP. Цели, состав данных, права субъекта и контакты оператора.",
          },
        }}
        lang="ru"
        path="/politika-konfidencialnosti/"
      />
      <PageShell
        title="Политика конфиденциальности"
        description="Обработка персональных данных клиентов личного кабинета и сайта MG.GROUP."
      >
        <article className="mx-auto max-w-3xl space-y-6 text-[15px] leading-relaxed text-zinc-700">
          <p className="text-sm text-zinc-500">Обновлено: 18 октября 2026 г.</p>

          <p>
            Настоящая Политика определяет порядок обработки персональных данных пользователей
            сайта <strong>mg-group.by</strong> и личного кабинета {COMPANY.name}. Документ носит
            информационный характер и не является рекламным предложением.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">1. Оператор данных</h2>
            <p className="mt-2">
              Оператор: {COMPANY.name}. Адрес: {COMPANY.address}. Контактные телефоны:{" "}
              {PHONES.map((p) => p.display).join(", ")}.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">2. Какие данные обрабатываем</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>ФИО, номер телефона, логин кабинета;</li>
              <li>данные аккаунта Telegram (если вход через Telegram);</li>
              <li>
                сведения о сделках и заказах (авто, VIN, лот, этапы доставки, оплата, заметки
                менеджера);
              </li>
              <li>технические данные сессии входа (токен авторизации в браузере).</li>
            </ul>
            <p className="mt-2">
              Мы не запрашиваем платёжные реквизиты карт на сайте для сторонней рекламы и не
              передаём данные рекламным сетям.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">3. Цели обработки</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>идентификация клиента и вход в личный кабинет;</li>
              <li>ведение сделки: статус, логистика, карта разбора, документы и фото;</li>
              <li>связь менеджера с клиентом (телефон, SMS, мессенджеры — по необходимости);</li>
              <li>исполнение договорённостей по подбору, покупке и доставке авто / комплектов;</li>
              <li>обеспечение безопасности доступа и предотвращение несанкционированного входа.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">4. Правовые основания</h2>
            <p className="mt-2">
              Обработка осуществляется на основании согласия субъекта персональных данных,
              выраженного при входе в кабинет (отметка о согласии), а также в объёме,
              необходимом для исполнения обязательств перед клиентом.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">5. Кому могут передаваться данные</h2>
            <p className="mt-2">
              Данные могут быть доступны сотрудникам {COMPANY.name} (менеджеры, логисты), а также
              привлечённым исполнителям в объёме, нужном для доставки и оформления (таможня,
              перевозчик, склад) — только в рамках сделки. Передача третьим лицам в иных целях
              без законных оснований не производится.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">6. Срок хранения</h2>
            <p className="mt-2">
              Данные хранятся в течение срока ведения сделки и разумного периода после её
              завершения, необходимого для учёта и разрешения возможных претензий, либо до
              отзыва согласия — если иное не требуется для исполнения обязательств или
              требований законодательства.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">7. Права клиента</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>получить сведения об обработке своих данных;</li>
              <li>потребовать уточнения, блокирования или удаления данных, если это допустимо;</li>
              <li>отозвать согласие, обратившись к оператору (вход в кабинет при этом может стать недоступен).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">8. Согласие при входе</h2>
            <p className="mt-2">
              При первом входе в личный кабинет клиент подтверждает ознакомление с настоящей
              Политикой отдельной отметкой (галочкой). Без согласия вход недоступен. Факт
              согласия сохраняется в браузере на устройстве клиента.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">9. Cookies</h2>
            <p className="mt-2">
              Использование cookies описано отдельно:{" "}
              <Link
                href="/cookies/"
                className="font-medium text-[#1B5E20] underline underline-offset-2"
              >
                Политика cookies
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">10. Контакты</h2>
            <p className="mt-2">
              Вопросы по персональным данным:{" "}
              <Link
                href="/contacts/"
                className="font-medium text-[#1B5E20] underline underline-offset-2"
              >
                страница контактов
              </Link>{" "}
              или телефоны в подвале сайта.
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
