import type { Deal } from "@/lib/api/cabinet";
import { dealLocation } from "@/lib/cabinet/deal-list";

export function DealLocationBadge({ deal }: { deal: Deal }) {
  return (
    <span className="mt-1.5 inline-flex rounded-md bg-white/75 px-2 py-0.5 text-xs font-medium text-zinc-800 ring-1 ring-inset ring-black/10">
      {dealLocation(deal).label}
    </span>
  );
}
