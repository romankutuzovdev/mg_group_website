import { useEffect, useState } from "react";
import type { GetStaticProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowRight, Calculator, MessageCircle } from "lucide-react";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
import { Button, Spinner } from "@/components/cabinet/ui";
import { EstimateNotice } from "@/components/pricing/estimate-notice";
import { QuoteShareActions, quoteShareUrl } from "@/components/pricing/quote-share-actions";
import { fetchSharedQuote } from "@/lib/api/cabinet";
import { consultationMessage } from "@/lib/company";
import { getDictionary, type Dictionary } from "@/lib/dictionary";
import { formatQuoteMoney, QUOTE_KIND_LABELS, type SharedQuote } from "@/lib/pricing/share-quote";
import { resolveLotImageUrl } from "@/lib/auctions/lot-image-url";

export default function SharedQuotePage({ dictionary }: { dictionary: Dictionary }) {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [shared, setShared] = useState<SharedQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [failedImages, setFailedImages] = useState<string[]>([]);

  useEffect(() => {
    if (!router.isReady) return;
    let cancelled = false;
    setShared(null);
    setFailedImages([]);
    setError("");
    if (!/^[A-Za-z0-9_-]{32}$/.test(id)) {
      setLoading(false);
      setError("В ссылке нет просчёта или она скопирована не полностью. Уточните ссылку у отправителя.");
      return;
    }
    setLoading(true);
    void fetchSharedQuote(id)
      .then((result) => { if (!cancelled) setShared(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Не удалось загрузить просчёт."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, router.isReady, attempt]);

  const quote = shared?.quote;
  const images = Array.from(new Set(
    [quote?.image_url, ...(quote?.image_urls || [])].map((url) => (url || "").trim()).filter(Boolean),
  ));

  return (
    <>
      <SEO dictionary={dictionary} lang="ru" path="/quote/" noindex
        title={quote ? `${quote.title} · Просчёт | MG.GROUP` : "Просчёт автомобиля | MG.GROUP"}
        description="Просчёт MG.GROUP: автомобиль, доставка, услуги и итоговая стоимость. Обсудите детали с нашим менеджером."
      />
      <PageShell bare className="w-full max-w-5xl space-y-6 pb-20 sm:pb-12">
        <Link href="/calculator/" className="inline-flex min-h-11 items-center gap-2 text-sm text-text-secondary hover:text-accent-dark">
          <Calculator className="h-4 w-4" aria-hidden="true" /> Калькуляторы MG.GROUP
        </Link>

        {loading ? (
          <div role="status" className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-text-secondary">
            <Spinner /> Загружаем просчёт…
          </div>
        ) : error ? (
          <section className="rounded-xl border border-border bg-white p-6 sm:p-8">
            <h1 className="font-display text-2xl font-semibold text-text-primary">Не удалось открыть просчёт</h1>
            <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>
            <Button className="mt-5 min-h-11" onClick={() => setAttempt((value) => value + 1)}>Повторить</Button>
          </section>
        ) : shared && quote ? (
          <>
            <section className="overflow-hidden rounded-xl border border-border bg-white">
              <div className="p-5 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-dark">MG.GROUP · Сохранённый просчёт</p>
                <h1 className="mt-3 break-words font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">{quote.title}</h1>
                <p className="mt-2 text-sm text-text-secondary">{QUOTE_KIND_LABELS[quote.kind]}</p>
                {quote.location ? <p className="mt-2 text-sm text-text-secondary">Площадка: {quote.location}</p> : null}
                {quote.bid != null ? (
                  <p className="mt-2 text-sm text-text-secondary">
                    {quote.kind === "customs" ? "Стоимость авто" : "Исходная ставка"}: <strong className="font-medium text-text-primary">{formatQuoteMoney(quote.bid, quote.currency)}</strong>
                  </p>
                ) : null}
                <p className="mt-5 text-xs text-text-muted">
                  Сохранён {new Date(shared.created_at).toLocaleString("ru-RU")}
                </p>
              </div>
            </section>

            {images.length ? (
              <section className="rounded-xl border border-border bg-white p-4 sm:p-6">
                <h2 className="mb-4 font-display text-lg font-semibold text-text-primary">
                  Фото автомобиля <span className="text-sm font-normal text-text-muted">· {images.length}</span>
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                  {images.map((image, index) => failedImages.includes(image) ? null : (
                    <a key={`${index}-${image}`} href={resolveLotImageUrl(image)} target="_blank" rel="noreferrer"
                      className="group aspect-[4/3] overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200">
                      <img src={resolveLotImageUrl(image)} alt={`${quote.title} — фото ${index + 1}`}
                        loading={index < 4 ? "eager" : "lazy"} referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                        onError={() => setFailedImages((current) => [...current, image])} />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0 rounded-xl border border-border bg-white p-5 sm:p-7">
                <h2 className="font-display text-lg font-semibold text-text-primary">{quote.breakdown?.length ? "Из чего складывается стоимость" : "Результат просчёта"}</h2>
                {quote.breakdown?.length ? (
                  <dl className="mt-4 divide-y divide-border">
                    {quote.breakdown.map((line, index) => (
                      <div key={`${index}-${line.label}`} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                        <dt className="min-w-0 text-text-secondary">{line.label}</dt>
                        <dd className="shrink-0 font-medium tabular-nums text-text-primary">{formatQuoteMoney(line.amount, line.currency)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {quote.summary ? <p className="mt-4 whitespace-pre-line break-words text-sm leading-relaxed text-text-secondary">{quote.summary}</p> : null}
                <QuoteShareActions quote={quote} sharedQuote={shared} />
              </section>

              <aside className="order-first space-y-4 lg:order-last lg:sticky lg:top-24">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
                  <p className="text-sm font-medium text-emerald-900">Итого по просчёту</p>
                  <p className="mt-2 break-words font-display text-3xl font-semibold tabular-nums tracking-tight text-emerald-950">{formatQuoteMoney(quote.total_usd)}</p>
                  <p className="mt-3 text-xs leading-relaxed text-emerald-900/80">Цифры зафиксированы при отправке. Изменение ставки в калькуляторе не меняет эту страницу.</p>
                </div>
                <EstimateNotice />
                <a
                  href={consultationMessage(`Здравствуйте! Хочу обсудить просчёт ${quote.title}: ${quoteShareUrl(shared.id)}`)}
                  target="_blank" rel="noreferrer"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-dark px-4 py-3 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> Обсудить с менеджером
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </aside>
            </div>
          </>
        ) : null}
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps = async () => ({ props: { dictionary: getDictionary() } });
