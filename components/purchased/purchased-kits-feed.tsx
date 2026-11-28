import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchPublishedKits, type PublishedKit } from "@/lib/api/client";
import { formatCaseMoney } from "@/lib/cases";

export function PurchasedKitsFeed({ initialItems }: { initialItems: PublishedKit[] | null }) {
  const [items, setItems] = useState(initialItems);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchPublishedKits()
      .then((next) => { if (active) setItems(next); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold">Опубликованные покупки</h2>
      {items?.length ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((kit) => (
            <li key={kit.id} className="card-premium rounded-xl p-5">
              <p className="text-sm text-text-secondary">{kit.region === "usa" ? "США" : "Англия"}</p>
              <h3 className="mt-2 font-semibold">
                <Link href={`/podborka/?id=${kit.id}`} className="text-accent-dark underline underline-offset-2">{kit.title}</Link>
              </h3>
              {kit.bid != null && kit.bid > 0 && (
                <p className="mt-3 text-sm">Ставка на аукционе — {formatCaseMoney(kit.bid, kit.currency)}</p>
              )}
              {kit.totalUsd != null && kit.totalUsd > 0 && (
                <p className="mt-1 text-sm">По расчёту менеджера — {formatCaseMoney(kit.totalUsd, "USD")}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          {items ? "Менеджеры пока не опубликовали карточки выкупленных комплектов."
            : failed ? "Сейчас не удалось получить карточки покупок."
            : "Загружаем опубликованные карточки из витрины MG.GROUP."}
        </p>
      )}
      <p className="mt-4 text-sm">
        <Link href="/otzyvy/#otzyv-3" className="font-medium text-accent-dark underline underline-offset-2">
          Отзыв клиента из Бреста о машинокомплекте Ford F-150
        </Link>
      </p>
    </section>
  );
}
