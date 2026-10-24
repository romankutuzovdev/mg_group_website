import { SOURCE_LABELS } from "@/lib/auctions/types";

/** Площадки США, UK, Кореи и Китая — бегущая строка на главной. */
const AUCTIONS = [
  SOURCE_LABELS.copart,
  SOURCE_LABELS.iaai,
  SOURCE_LABELS.manheim,
  SOURCE_LABELS.copart_uk,
  SOURCE_LABELS.salvage_market,
  SOURCE_LABELS.encar,
  "Che168",
  "Guazi",
  "Mobile.de",
  "Autoplius.lt",
];

export function PartnersTicker() {
  const items = [...AUCTIONS, ...AUCTIONS];

  return (
    <div className="border-b border-stone-800 bg-stone-900 py-5">
      <div className="partners-ticker">
        <div className="partners-ticker-track items-center gap-8 px-6">
          {items.map((name, index) => (
            <span key={`${name}-${index}`} className="flex shrink-0 items-center gap-8">
              <span className="text-base font-semibold uppercase tracking-[0.2em] !text-white sm:text-lg">
                {name}
              </span>
              <span className="h-1 w-1 rounded-full bg-primary" aria-hidden />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
