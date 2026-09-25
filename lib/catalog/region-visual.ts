import type { CatalogRegionSlug } from "@/lib/catalog";

export type RegionVisual = {
  slug: CatalogRegionSlug;
  code: string;
  shortTitle: string;
  tagline: string;
  sources: string;
  /** CSS gradient for hero / panels */
  wash: string;
  accent: string;
  glow: string;
};

export const REGION_VISUAL: Record<CatalogRegionSlug, RegionVisual> = {
  usa: {
    slug: "usa",
    code: "US",
    shortTitle: "США",
    tagline: "Copart · IAAI · ставка и просчёт под ключ",
    sources: "Copart, IAAI",
    wash: "linear-gradient(135deg, #06140a 0%, #0c2814 42%, #14301f 68%, #0a1a10 100%)",
    accent: "#22c55e",
    glow: "rgba(34,197,94,0.45)",
  },
  china: {
    slug: "china",
    code: "CN",
    shortTitle: "Китай",
    tagline: "BYD · Zeekr · Li Auto · новые модели под заказ",
    sources: "Дилеры и экспорт",
    wash: "linear-gradient(135deg, #12080a 0%, #2a1216 40%, #1a0e12 70%, #0d0809 100%)",
    accent: "#ef4444",
    glow: "rgba(239,68,68,0.35)",
  },
  korea: {
    slug: "korea",
    code: "KR",
    shortTitle: "Корея",
    tagline: "Encar · Hyundai · Kia · Genesis с проверкой",
    sources: "Encar",
    wash: "linear-gradient(135deg, #070b14 0%, #101a2e 45%, #0c1524 72%, #080c14 100%)",
    accent: "#38bdf8",
    glow: "rgba(56,189,248,0.35)",
  },
  uk: {
    slug: "uk",
    code: "UK",
    shortTitle: "Англия",
    tagline: "Copart UK · авто и машинокомплекты",
    sources: "Copart UK",
    wash: "linear-gradient(135deg, #0a0c10 0%, #161b24 44%, #1a1520 70%, #0c0e12 100%)",
    accent: "#94a3b8",
    glow: "rgba(148,163,184,0.35)",
  },
};

export function getRegionVisual(slug: CatalogRegionSlug): RegionVisual {
  return REGION_VISUAL[slug];
}
