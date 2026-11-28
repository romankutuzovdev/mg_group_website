import { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { organizationJsonLd } from "@/components/catalog/seo";
import { OfficeMap } from "@/components/contacts/office-map";
import { LeadForm } from "@/components/leads/lead-form";
import { PageShell } from "@/components/layout/page-shell";
import { AnchorButton } from "@/components/site/button";
import { MessengerLinks } from "@/components/site/messengers";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { COMPANY, CONSULTATION_TG, OFFICE_MAPS, PHONES } from "@/lib/company";

interface Props {
  dictionary: Dictionary;
}

export default function ContactsPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Контакты MG.GROUP в Гродно — адрес офиса и часы работы",
            description: `Офис MG.GROUP по адресу ${COMPANY.address}. ${COMPANY.hoursWeekdays}. Телефон для консультации ${PHONES[0].display}. Схема проезда и контакты менеджеров.`,
          },
        }}
        lang="ru"
        path="/contacts/"
        jsonLd={organizationJsonLd()}
      />
      <PageShell
        title="Контакты MG.GROUP в Гродно"
        description="Свяжитесь с нами в Viber, Telegram или WhatsApp — подберём авто, машинокомплект или спецтехнику."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="card-premium rounded-2xl p-8">
            <h2 className="font-display text-xl font-semibold">Телефоны</h2>
            <ul className="mt-6 space-y-4">
              {PHONES.map((phone) => (
                <li key={phone.tel} className="flex flex-wrap items-center gap-3">
                  <a
                    href={`tel:${phone.tel}`}
                    className="text-lg font-semibold text-text-primary transition hover:text-accent"
                  >
                    {phone.display}
                  </a>
                  <MessengerLinks messengers={phone.messengers} />
                </li>
              ))}
            </ul>
            <AnchorButton
              href={CONSULTATION_TG}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8"
            >
              Нужна консультация
            </AnchorButton>
          </div>

          <div className="card-premium rounded-2xl p-8">
            <h2 className="font-display text-xl font-semibold">Адрес</h2>
            <p className="mt-4 text-text-secondary">{COMPANY.address}</p>
            <p className="mt-4 text-sm text-text-secondary">{COMPANY.hoursWeekdays}</p>
            <p className="text-sm text-text-secondary">{COMPANY.hoursWeekend}</p>
            <OfficeMap className="mt-6 h-72 w-full sm:h-80" />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-accent-dark underline">
              <a href={OFFICE_MAPS.google}>Открыть в Google Картах</a>
              <a href={OFFICE_MAPS.yandex}>Открыть в Яндекс Картах</a>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="font-display text-2xl font-semibold">Заявка на подбор</h2>
          <p className="mt-3 max-w-2xl text-sm text-text-secondary">
            Бесплатный подбор под бюджет и задачу. Специалист ответит в удобный мессенджер.
          </p>
          <div className="mt-6 max-w-2xl">
            <LeadForm source="contacts" />
          </div>
        </div>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({
  props: { dictionary: getDictionary() },
});
