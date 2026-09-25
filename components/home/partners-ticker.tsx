import { SOURCE_LABELS } from "@/lib/auctions/types";

/** Аукционы США и Англии — бегущая строка на главной. */
const AUCTIONS = [
  SOURCE_LABELS.copart, // США
  SOURCE_LABELS.iaai, // США
  SOURCE_LABELS.manheim, // США
  SOURCE_LABELS.copart_uk, // Англия
  SOURCE_LABELS.salvage_market, // Англия
];

export function PartnersTicker() {
  const items = [...AUCTIONS, ...AUCTIONS];

  return (
    <div className="border-b border-border bg-bg-elevated py-4">
      <div className="partners-ticker">
        <div className="partners-ticker-track items-center gap-8 px-6">
          {items.map((name, index) => (
            <span key={`${name}-${index}`} className="flex shrink-0 items-center gap-8">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                {name}
              </span>
              <span className="ticker-sep" aria-hidden />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
