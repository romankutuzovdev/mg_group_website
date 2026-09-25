import Link from "next/link";
import { AnchorButton, LinkButton } from "@/components/site/button";
import { CONSULTATION_TG } from "@/lib/company";
import type { FaqItem } from "@/lib/seo/copy";

export function SeoFaq({ items }: { items: FaqItem[] }) {
  return (
    <div className="mt-10 space-y-4">
      <h2 className="font-display text-xl font-semibold">Частые вопросы</h2>
      <dl className="space-y-3">
        {items.map((item) => (
          <div key={item.q} className="rounded-xl border border-border bg-white p-4">
            <dt className="font-semibold text-text-primary">{item.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-text-secondary">{item.a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SeoCta({
  primaryHref = CONSULTATION_TG,
  primaryLabel = "Заказать подбор",
  secondaryHref = "/avto/",
  secondaryLabel = "Каталог авто",
}: {
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="mt-10 flex flex-wrap gap-3">
      <AnchorButton href={primaryHref} target="_blank" rel="noopener noreferrer">
        {primaryLabel}
      </AnchorButton>
      <LinkButton href={secondaryHref} variant="secondary">
        {secondaryLabel}
      </LinkButton>
      <LinkButton href="/contacts/" variant="secondary">
        Контакты
      </LinkButton>
    </div>
  );
}

export function CityNavLinks({
  cities,
  currentSlug,
  hrefFor,
}: {
  cities: { slug: string; name: string }[];
  currentSlug?: string;
  hrefFor: (slug: string) => string;
}) {
  return (
    <div className="mt-8">
      <p className="text-sm font-semibold text-text-primary">Города доставки</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {cities.map((c) => (
          <li key={c.slug}>
            <Link
              href={hrefFor(c.slug)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                c.slug === currentSlug
                  ? "border-accent bg-accent/10 text-accent-dark"
                  : "border-border text-text-secondary hover:border-accent hover:text-accent-dark"
              }`}
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
