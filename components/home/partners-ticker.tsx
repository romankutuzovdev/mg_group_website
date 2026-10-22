import { SOURCE_LABELS } from "@/lib/auctions/types";

/** Аукционы США и Англии — бегущая строка на главной. */
const AUCTIONS = [
  SOURCE_LABELS.copart,
  SOURCE_LABELS.iaai,
  SOURCE_LABELS.manheim,
  SOURCE_LABELS.copart_uk,
  SOURCE_LABELS.salvage_market,
];

export function PartnersTicker() {
  const items = [...AUCTIONS, ...AUCTIONS];

  return (
    <div className="border-b border-stone-800 bg-stone-900 py-5">
      <div className="partners-ticker">
        <div className="partners-ticker-track items-center gap-8 px-6">
          {items.map((name, index) => (
            <span key={`${name}-${index}`} className="flex shrink-0 items-center gap-8">
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
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
