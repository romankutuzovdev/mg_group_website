"use client";

import { useIsManager } from "@/lib/use-is-manager";
import { SOURCE_LABELS, type AuctionLot } from "@/lib/auctions/types";

type Props = {
  lot: Pick<AuctionLot, "source" | "region" | "lotNumber" | "lotUrl">;
  /** Show source name badge (Copart / IAAI / …). Default true when manager. */
  showBadge?: boolean;
  /** Show external auction / Bid.cars link. Default true when manager. */
  showLink?: boolean;
  className?: string;
};

function sourceLinkLabel(lot: Props["lot"]): string {
  if (lot.source === "copart_uk") return "Лот на copart.co.uk →";
  if (lot.source === "copart") return "Лот на Copart →";
  if (lot.source === "iaai") return "Лот на IAAI →";
  if (lot.region === "usa" && lot.lotUrl) return "Ссылка на лот →";
  return "Ссылка на лот →";
}

function resolveHref(lot: Props["lot"]): string | null {
  if (lot.lotUrl) return lot.lotUrl;
  if (lot.source === "copart_uk") {
    return `https://www.copart.co.uk/lot/${lot.lotNumber}`;
  }
  if (lot.source === "copart") {
    return `https://www.copart.com/lot/${lot.lotNumber}`;
  }
  if (lot.source === "encar") {
    return `https://fem.encar.com/cars/detail/${lot.lotNumber}`;
  }
  if (lot.source === "china_market" || lot.region === "china") {
    return `https://www.che168.com/dealer/${lot.lotNumber}.html`;
  }
  return null;
}

/** Auction source badge + external link — visible only to managers. */
export function ManagerLotSource({
  lot,
  showBadge = true,
  showLink = true,
  className = "",
}: Props) {
  const isManager = useIsManager();
  if (!isManager) return null;

  const href = showLink ? resolveHref(lot) : null;

  return (
    <div className={className}>
      {showBadge ? (
        <span className="rounded-md bg-black px-2 py-0.5 text-xs font-semibold text-white">
          {SOURCE_LABELS[lot.source]}
        </span>
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-accent-dark underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {sourceLinkLabel(lot)}
        </a>
      ) : null}
    </div>
  );
}

/** Compact source pill for cards — managers only. */
export function ManagerSourcePill({
  source,
  className = "",
}: {
  source: AuctionLot["source"];
  className?: string;
}) {
  const isManager = useIsManager();
  if (!isManager) return null;
  return (
    <span
      className={`rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white sm:px-2 sm:text-[10px] ${className}`}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}
