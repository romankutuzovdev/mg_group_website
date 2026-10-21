import { GetStaticProps } from "next";
import Link from "next/link";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { AnchorButton, LinkButton } from "@/components/site/button";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { CONSULTATION_TG, PHONES } from "@/lib/company";

interface Props {
  dictionary: Dictionary;
}

export default function ThankYouPage({ dictionary }: Props) {
  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Спасибо за заявку | MG.GROUP",
            description:
              "Ваша заявка отправлена. Менеджер MG.GROUP свяжется с вами в ближайшее время.",
          },
        }}
        lang="ru"
        path="/thanks/"
        noindex
      />
      <PageShell
        title="Спасибо!"
        description="Заявка принята — менеджер свяжется с вами в ближайшее время."
      >
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-white p-8 text-center sm:p-10">
          <p className="text-sm leading-relaxed text-text-secondary">
            Мы получили ваши контакты. Ответим в удобном мессенджере или по телефону.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <AnchorButton
              href={CONSULTATION_TG}
              target="_blank"
              rel="noopener noreferrer"
            >
              Написать в Telegram
            </AnchorButton>
            <LinkButton href="/" variant="secondary">
              На главную
            </LinkButton>
          </div>
          <p className="mt-8 text-xs text-text-muted">
            Или позвоните:{" "}
            <a
              href={`tel:${PHONES[0]?.tel}`}
              className="font-medium text-text-primary underline-offset-2 hover:underline"
            >
              {PHONES[0]?.display}
            </a>
            {" · "}
            <Link href="/contacts/" className="underline-offset-2 hover:underline">
              Контакты
            </Link>
          </p>
        </div>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: { dictionary: getDictionary("ru") },
});
