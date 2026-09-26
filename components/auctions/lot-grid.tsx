import type { LotPricingMode } from "@/lib/auctions/lot-quote";
import type { AuctionLot } from "@/lib/auctions/types";
import { LotCard } from "./lot-card";

export function LotGrid({
  lots,
  pricingMode,
  onLotNavigate,
}: {
  lots: AuctionLot[];
  pricingMode?: LotPricingMode;
  onLotNavigate?: (slug: string) => void;
}) {
  if (lots.length === 0) {
    return (
      <div className="card-premium rounded-xl p-12 text-center">
        <p className="font-display text-xl font-semibold">Лоты не найдены</p>
        <p className="mt-2 text-text-secondary">Попробуйте изменить фильтры или сбросить их.</p>
      </div>
    );
  }

  return (
    <div className="grid content-start gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
      {lots.map((lot) => (
        <LotCard
          key={lot.id}
          lot={lot}
          pricingMode={pricingMode}
          onNavigate={onLotNavigate}
        />
      ))}
    </div>
  );
}
