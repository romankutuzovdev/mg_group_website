import Link from "next/link";
import { SeoCta } from "@/components/seo/seo-blocks";
import { CityNavLinks } from "@/components/seo/seo-blocks";
import { CITIES, cityPath } from "@/lib/seo/cities";

type Props = {
  /** Optional context line, e.g. "BMW из США" */
  context?: string;
};

export function CatalogComingSoon({ context }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-white p-8 sm:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Скоро</p>
      <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        Каталог авто будет добавлен
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
        {context
          ? `Раздел «${context}» готовится к публикации: марки, модели и фото появятся здесь.`
          : "Раздел каталога готовится к публикации: марки, модели и фото появятся здесь."}{" "}
        Сейчас можно оформить подбор или посмотреть машинокомплекты и доставку по городам.
      </p>

      <ul className="mt-6 space-y-2 text-sm text-text-secondary">
        <li>
          <Link href="/mashinokomplekt/" className="font-medium text-primary hover:underline">
            Машинокомплекты из США и Англии →
          </Link>
        </li>
        <li>
          <Link href="/calculator/" className="font-medium text-primary hover:underline">
            Калькулятор стоимости →
          </Link>
        </li>
        <li>
          <Link href="/contacts/" className="font-medium text-primary hover:underline">
            Контакты →
          </Link>
        </li>
      </ul>

      <div className="mt-8 border-t border-border pt-6">
        <p className="text-sm font-semibold text-text-primary">Доставка по городам</p>
        <CityNavLinks cities={CITIES} hrefFor={(slug) => cityPath(slug)} />
      </div>

      <SeoCta primaryLabel="Заказать подбор авто" />
    </div>
  );
}
