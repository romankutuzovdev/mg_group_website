import type { Deal } from "@/lib/api/cabinet";

type SearchableDeal = Pick<Deal, "title" | "vin" | "lot_number">;

type SearchableClientGroup = {
  name: string;
  sub: string;
  managerName: string;
  deals: SearchableDeal[];
};

export function filterClientGroups<T extends SearchableClientGroup>(groups: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const result: T[] = [];

  for (const group of groups) {
    if ([group.name, group.sub, group.managerName].some((value) => value.toLowerCase().includes(q))) {
      result.push(group);
      continue;
    }

    const deals = group.deals.filter((deal) => dealMatchesSearch(deal, q));
    if (deals.length) result.push({ ...group, deals });
  }
  return result;
}

function normalizeIdentifier(value: string): string {
  return value.toLowerCase().replace(/[\s#-]+/g, "");
}

export function dealMatchesSearch(deal: SearchableDeal, query: string): boolean {
  return Boolean(
    findSearchMatch(deal.title, query) ||
    findSearchMatch(deal.vin || "", query, true) ||
    findSearchMatch(deal.lot_number || "", query, true),
  );
}

/** Original text offsets let the UI highlight a VIN pasted with separators. */
export function findSearchMatch(value: string, query: string, identifier = false): { start: number; end: number } | null {
  const q = identifier ? normalizeIdentifier(query) : query.trim().toLowerCase();
  if (!q) return null;
  if (!identifier) {
    const start = value.toLowerCase().indexOf(q);
    return start < 0 ? null : { start, end: start + q.length };
  }

  const start = normalizeIdentifier(value).indexOf(q);
  if (start < 0) return null;
  const positions: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!/[\s#-]/.test(value[i])) positions.push(i);
  }
  return { start: positions[start], end: positions[start + q.length - 1] + 1 };
}
