/**
 * Title / Sale Doc доплата — порт из mg group bot/usa_title.py
 */
import titleTariffs from "./data/usa_title_tariffs.json";

type TitleRow = { name: string; cost_usd: number; cost_raw?: string };
type TitleRule = {
  id?: string;
  name: string;
  cost_usd: number;
  all?: string[];
  any?: string[];
};

const data = titleTariffs as { rows: TitleRow[]; rules: TitleRule[] };

function norm(text: string | null | undefined): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasToken(text: string, token: string): boolean {
  const tok = norm(token);
  if (!tok) return false;
  if (tok.includes(" ") || tok.length >= 5) return text.includes(tok);
  return new RegExp(`(?<![a-z0-9])${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(
    text,
  );
}

export type TitleFeeInfo = {
  documentRaw: string;
  matchedRule: string | null;
  matchedId: string | null;
  costUsd: number | null;
  free: boolean;
  unmatched: boolean;
};

export function listTitleTariffs(): { name: string; costUsd: number }[] {
  const items: { name: string; costUsd: number }[] = [];
  const seen = new Set<string>();
  for (const row of data.rows || []) {
    const name = String(row.name || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    items.push({ name, costUsd: Number(row.cost_usd) || 0 });
  }
  for (const rule of data.rules || []) {
    const name = String(rule.name || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    items.push({ name, costUsd: Number(rule.cost_usd) || 0 });
  }
  return items.sort((a, b) => a.costUsd - b.costUsd || a.name.localeCompare(b.name));
}

export function lookupTitleFee(documentText: string | null | undefined): TitleFeeInfo | null {
  const raw = String(documentText || "").trim();
  if (!raw) return null;
  const text = norm(raw);

  for (const row of data.rows || []) {
    const name = String(row.name || "").trim();
    if (name && norm(name) === text) {
      const cost = Number(row.cost_usd) || 0;
      return {
        documentRaw: raw,
        matchedRule: name,
        matchedId: null,
        costUsd: cost,
        free: cost <= 0,
        unmatched: false,
      };
    }
  }

  for (const rule of data.rules || []) {
    const name = String(rule.name || "").trim();
    if (name && norm(name) === text) {
      const cost = Number(rule.cost_usd) || 0;
      return {
        documentRaw: raw,
        matchedRule: name,
        matchedId: rule.id || null,
        costUsd: cost,
        free: cost <= 0,
        unmatched: false,
      };
    }
    const allNeed = (rule.all || []).map(String).filter(Boolean);
    const anyNeed = (rule.any || []).map(String).filter(Boolean);
    if (allNeed.length && !allNeed.every((tok) => hasToken(text, tok))) continue;
    if (anyNeed.length && !anyNeed.some((tok) => hasToken(text, tok))) continue;
    if (!allNeed.length && !anyNeed.length) continue;
    const cost = Number(rule.cost_usd) || 0;
    return {
      documentRaw: raw,
      matchedRule: rule.name || rule.id || null,
      matchedId: rule.id || null,
      costUsd: cost,
      free: cost <= 0,
      unmatched: false,
    };
  }

  return {
    documentRaw: raw,
    matchedRule: null,
    matchedId: null,
    costUsd: null,
    free: false,
    unmatched: true,
  };
}
