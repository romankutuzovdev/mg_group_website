import { useEffect, useMemo, useState } from "react";
import { GetStaticProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import SEO from "@/components/SEO";
import { LotImage } from "@/components/auctions/lot-image";
import { AnchorButton, LinkButton } from "@/components/site/button";
import { KIND_LABELS, money, regionLabel } from "@/components/home/showcase-picks";
import { fetchShowcasePick, type ShowcasePick } from "@/lib/api/cabinet";
import { displayDamage } from "@/lib/auctions/listing-blob";
import { collectLotPhotoUrls, toLotHeroUrl, toLotThumbUrl } from "@/lib/auctions/lot-image-url";
import { consultationMessage } from "@/lib/company";
import { getDictionary, type Dictionary } from "@/lib/dictionary";

type Props = { dictionary: Dictionary };

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-text-primary">{value}</dd>
    </div>
  );
}

/** Машина из подборки менеджеров или из купленных: фото, характеристики и просчёт под ключ. */
export default function ShowcasePickPage({ dictionary }: Props) {
  const router = useRouter();
  const id = Number(router.query.id);
  const [pick, setPick] = useState<ShowcasePick | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!router.isReady) return;
    if (!Number.isFinite(id) || id <= 0) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    fetchShowcasePick(id)
      .then((data) => {
        if (cancelled) return;
        setPick(data);
        setActive(0);
        setStatus("ok");
      })
      .catch(() => !cancelled && setStatus("missing"));
    return () => {
      cancelled = true;
    };
  }, [router.isReady, id]);

  const photos = useMemo(
    () => (pick ? collectLotPhotoUrls({ imageUrl: pick.image_url, imageUrls: pick.images }) : []),
    [pick],
  );
  const title = pick
    ? [pick.year, pick.make, pick.model].filter(Boolean).join(" ") || pick.title || "Авто"
    : "Авто из подборки";
  const safeActive = photos.length ? Math.min(active, photos.length - 1) : 0;
  const specs: Array<[string, string]> = pick
    ? ([
        ["Тип", KIND_LABELS[pick.kind]],
        ["Откуда", [regionLabel(pick.region), pick.source].filter(Boolean).join(" · ")],
        ["Год", pick.year ? String(pick.year) : ""],
        ["Пробег", pick.odometer],
        ["Повреждение", displayDamage(pick.damage)],
        ...Object.entries(pick.specs || {}),
      ].filter(([, value]) => value) as Array<[string, string]>)
    : [];
  const backHref = pick?.bought ? "/#bought" : pick?.kind === "kit" ? "/#picks-kits" : "/#catalog-showcase";

  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: `${title} | MG.GROUP`,
            description: pick?.total_usd
              ? `${title}: под ключ ${money(pick.total_usd)}. Просчёт менеджера MG.GROUP.`
              : dictionary.metadata.description,
          },
        }}
        lang="ru"
        path="/podborka/"
        noindex
      />
      <div className="pt-16">
        <div className="border-b border-border bg-bg-elevated">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Link href={backHref} className="text-sm text-text-secondary transition hover:text-accent-dark">
              ← На главную
            </Link>
            {pick ? (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-dark">
                    {regionLabel(pick.region)}
                  </span>
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {KIND_LABELS[pick.kind]}
                  </span>
                  {pick.bought ? (
                    <span className="rounded-md bg-[#22c55e] px-2 py-0.5 text-xs font-semibold text-white">
                      Купили
                    </span>
                  ) : (
                    <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">
                      Выбор менеджера
                    </span>
                  )}
                </div>
                <h1 className="mt-3 font-display text-2xl font-bold md:text-3xl">{title}</h1>
              </>
            ) : null}
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {status === "loading" ? (
            <p className="py-20 text-center text-sm text-text-secondary">Загружаем машину…</p>
          ) : status === "missing" || !pick ? (
            <div className="mx-auto max-w-md py-20 text-center">
              <h2 className="font-display text-xl font-semibold">Машина уже не в подборке</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Возможно, её купили или убрали с главной. Подберём похожую под ваш бюджет.
              </p>
              <LinkButton href="/#car-finder" className="mt-6">
                Заказать подбор
              </LinkButton>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
              <div className="min-w-0 space-y-6">
                <div className="space-y-3">
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-zinc-100">
                    <LotImage
                      src={toLotHeroUrl(photos[safeActive] || "")}
                      alt={title}
                      fill
                      priority
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 66vw"
                    />
                    {photos.length > 1 ? (
                      <span className="absolute bottom-3 right-3 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                        {safeActive + 1} / {photos.length}
                      </span>
                    ) : null}
                  </div>
                  {photos.length > 1 ? (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
                      {photos.map((src, i) => (
                        <button
                          key={`${src}-${i}`}
                          type="button"
                          onClick={() => setActive(i)}
                          aria-label={`Фото ${i + 1}`}
                          className={`relative aspect-[4/3] overflow-hidden rounded-lg border bg-zinc-100 ${
                            i === safeActive ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-zinc-400"
                          }`}
                        >
                          <LotImage src={toLotThumbUrl(src)} alt="" fill className="object-cover" sizes="120px" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {specs.length ? (
                  <section className="card-premium rounded-xl p-5 sm:p-6">
                    <h2 className="font-display text-lg font-semibold">Характеристики</h2>
                    <dl className="mt-3">
                      {specs.map(([label, value]) => (
                        <SpecRow key={label} label={label} value={value} />
                      ))}
                    </dl>
                  </section>
                ) : null}
              </div>

              <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                <div className="card-premium rounded-xl p-5 sm:p-6">
                  <p className="text-sm text-text-muted">Ставка на аукционе</p>
                  <p className="font-display text-3xl font-bold text-accent-dark">{money(pick.bid, pick.currency)}</p>

                  {pick.breakdown?.length ? (
                    <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                      {pick.breakdown.map((line) => (
                        <div key={line.label} className="flex justify-between gap-4">
                          <dt className="text-text-secondary">{line.label}</dt>
                          <dd className="shrink-0 font-medium tabular-nums">{money(line.amount)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  <div className="mt-4 rounded-xl bg-gradient-to-r from-[#22c55e]/15 to-[#22c55e]/5 p-4 ring-1 ring-inset ring-[#22c55e]/30">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0D3F10]">
                      {pick.bought ? "Обошлось под ключ" : "Итого под ключ"}
                    </p>
                    <p className="mt-0.5 font-display text-3xl font-bold tabular-nums text-[#0D3F10]">
                      {money(pick.total_usd)}
                    </p>
                    {pick.summary ? <p className="mt-1 text-xs text-zinc-600">{pick.summary}</p> : null}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-text-muted">
                    Просчёт менеджера на момент добавления. Итог зависит от ставки, курса, логистики и таможни.
                  </p>
                </div>

                <div className="card-premium space-y-3 rounded-xl p-5 sm:p-6">
                  <p className="text-sm font-semibold">
                    {pick.bought ? "Хотите такую же?" : "Интересует эта машина?"}
                  </p>
                  <AnchorButton
                    href={consultationMessage(`Здравствуйте! Интересует ${title} с сайта MG.GROUP`)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full"
                  >
                    Написать менеджеру
                  </AnchorButton>
                  <LinkButton href="/#car-finder" variant="secondary" className="w-full">
                    Подобрать похожую
                  </LinkButton>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: { dictionary: getDictionary() },
});
