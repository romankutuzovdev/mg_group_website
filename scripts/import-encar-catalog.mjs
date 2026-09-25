#!/usr/bin/env node
/**
 * Import encar_catalog.json → merge Korea lots into lib/auctions/generated-lots.json
 * (keeps USA / UK lots). Then sync SEO catalog tree.
 *
 * Input shape (flexible):
 *   { lots: [ { Id, Manufacturer, Model, Year, Price, Mileage, Photos, ... } ] }
 * or a raw Encar API payload with SearchResults.
 *
 * Usage:
 *   node scripts/import-encar-catalog.mjs
 *   ENCAR_JSON=./dump.json node scripts/import-encar-catalog.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = process.env.ENCAR_JSON
  ? join(ROOT, process.env.ENCAR_JSON)
  : join(ROOT, "encar_catalog.json");
const OUT_JSON = join(ROOT, "lib", "auctions", "generated-lots.json");

const MAKE_EN = {
  현대: "Hyundai",
  기아: "Kia",
  제네시스: "Genesis",
  쉐보레: "Chevrolet",
  르노코리아: "Renault Korea",
  르노삼성: "Renault Korea",
  쌍용: "KG Mobility",
  케이지모빌리티: "KG Mobility",
  KG모빌리티: "KG Mobility",
  BMW: "BMW",
  벤츠: "Mercedes-Benz",
  아우디: "Audi",
  폭스바겐: "Volkswagen",
  볼보: "Volvo",
  미니: "MINI",
  포르쉐: "Porsche",
  렉서스: "Lexus",
  토요타: "Toyota",
  도요타: "Toyota",
  혼다: "Honda",
  닛산: "Nissan",
  인피니티: "Infiniti",
  재규어: "Jaguar",
  랜드로버: "Land Rover",
  지프: "Jeep",
  포드: "Ford",
  링컨: "Lincoln",
  캐딜락: "Cadillac",
  테슬라: "Tesla",
  폴스타: "Polestar",
  BYD: "BYD",
};

const FUEL_EN = {
  가솔린: "Gasoline",
  휘발유: "Gasoline",
  디젤: "Diesel",
  LPG: "Gas",
  전기: "Electric",
  하이브리드: "Hybrid",
  "가솔린+전기": "Hybrid",
  수소: "Hydrogen",
};

const TRANS_EN = {
  오토: "Automatic",
  자동: "Automatic",
  수동: "Manual",
  CVT: "CVT",
};

function slugify(s) {
  return String(s || "x")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function titleCase(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const MODEL_EN = {
  그랜저: "Grandeur",
  쏘렌토: "Sorento",
  투싼: "Tucson",
  싼타페: "Santa Fe",
  아반떼: "Avante",
  쏘나타: "Sonata",
  팰리세이드: "Palisade",
  카니발: "Carnival",
  스포티지: "Sportage",
  셀토스: "Seltos",
  모닝: "Morning",
  레이: "Ray",
  니로: "Niro",
  EV6: "EV6",
  EV9: "EV9",
  아이오닉: "Ioniq",
  "아이오닉 5": "Ioniq 5",
  "아이오닉 6": "Ioniq 6",
  G70: "G70",
  G80: "G80",
  G90: "G90",
  GV70: "GV70",
  GV80: "GV80",
  K3: "K3",
  K5: "K5",
  K8: "K8",
  K9: "K9",
};

function makeEn(raw) {
  const t = String(raw || "").trim();
  return MAKE_EN[t] || MAKE_EN[t.replace(/\s+/g, "")] || titleCase(t) || "Unknown";
}

function modelEn(raw) {
  const t = String(raw || "").trim();
  if (!t) return "Unknown";
  if (MODEL_EN[t]) return MODEL_EN[t];
  // Already latin
  if (/^[A-Za-z0-9]/.test(t)) return titleCase(t);
  return titleCase(t);
}

function yearOf(row) {
  const raw = row.Year ?? row.year ?? row.FormYear ?? 0;
  const text = String(raw);
  const m = text.match(/(20\d{2})/);
  if (m) return Number(m[1]);
  const n = Number(raw);
  if (n > 1900) return n;
  if (n > 100000) return Math.floor(n / 100);
  return 2018;
}

function photosOf(row) {
  const out = [];
  const push = (u) => {
    if (!u || typeof u !== "string") return;
    let url = u.trim();
    if (!url) return;
    if (url.startsWith("//")) url = "https:" + url;
    else if (url.startsWith("/")) url = "https://ci.encar.com" + url;
    else if (!/^https?:/i.test(url)) url = "https://ci.encar.com/carpicture/" + url;
    out.push(url);
  };
  for (const key of ["Photos", "photos", "Photo", "photo", "images", "imageUrl", "image"]) {
    const val = row[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") push(item);
        else if (item && typeof item === "object") push(item.location || item.url || item.path);
      }
    } else if (typeof val === "string") push(val);
  }
  return [...new Set(out)];
}

function mapLot(row) {
  const lotNumber = String(row.Id ?? row.id ?? row.carId ?? row.carid ?? "").trim();
  if (!lotNumber) return null;

  let images = photosOf(row);
  if (!images.length && row.image) images = photosOf({ Photo: row.image });
  if (!images.length) {
    images = [`https://ci.encar.com/carpicture0${Number(lotNumber) % 10}/pic${lotNumber}_001.jpg`];
  }

  const year = yearOf(row);
  const make = makeEn(row.Manufacturer || row.manufacturer || row.make);
  const model = modelEn(row.Model || row.model || row.Badge || row.badge || "Unknown");
  const priceMan = Number(row.Price ?? row.price ?? row.priceManwon ?? 0) || 0;
  const priceKrw = priceMan > 0 && priceMan < 100000 ? priceMan * 10000 : priceMan;
  const usd = priceKrw ? Math.round(priceKrw / 1350) : 0;
  const fuelRaw = String(row.FuelType || row.fuelType || row.fuel || "");
  const transRaw = String(row.Transmission || row.transmission || "");

  return {
    id: `korea-${lotNumber}`,
    slug: `encar-${year}-${slugify(make)}-${slugify(model)}-${lotNumber}`,
    region: "korea",
    source: "encar",
    lotNumber,
    vin: String(row.Vin || row.vin || "*****************").slice(0, 17),
    make,
    model,
    year,
    titleType: "clean",
    titleLabel: "Encar (Korea)",
    primaryDamage: "—",
    odometer: Math.round(Number(row.Mileage || row.mileage || 0) || 0),
    odometerUnit: "km",
    currentBid: usd,
    buyNowPrice: usd || undefined,
    currency: "USD",
    location: String(row.OfficeCityState || row.location || "Korea"),
    auctionDate: new Date(Date.now() + 14 * 864e5).toISOString(),
    imageUrl: images[0],
    imageUrls: images.slice(0, 12),
    transmission: TRANS_EN[transRaw] || titleCase(transRaw) || "—",
    fuel: FUEL_EN[fuelRaw] || titleCase(fuelRaw) || "—",
    drive: "—",
    exteriorColor: titleCase(row.Color || row.color || "") || "—",
    hasKeys: true,
    runsDrives: true,
    estimatedRetail: priceKrw || undefined,
    engine: row.Displacement || row.engine || undefined,
    bodyStyle: titleCase(row.BodyName || row.bodyStyle || "") || undefined,
    lotUrl: `https://fem.encar.com/cars/detail/${lotNumber}`,
  };
}

function cleanLot(lot) {
  const out = { ...lot };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined || out[k] === "") delete out[k];
  }
  return out;
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.lots)) return payload.lots;
  if (Array.isArray(payload.SearchResults)) return payload.SearchResults;
  if (Array.isArray(payload.searchResults)) return payload.searchResults;
  if (Array.isArray(payload.Results)) return payload.Results;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function main() {
  if (!existsSync(SRC)) {
    console.error("Missing", SRC);
    console.error("Put an Encar dump at encar_catalog.json or set ENCAR_JSON=path");
    console.error("Tip: run the API scraper agent `encar`, or export SearchResults JSON.");
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(SRC, "utf8"));
  const rawLots = extractRows(payload);
  console.log("Source Encar rows:", rawLots.length);

  const koreaLots = rawLots.map(mapLot).filter(Boolean).map(cleanLot);
  console.log("Mapped Korea lots:", koreaLots.length);

  let keep = [];
  if (existsSync(OUT_JSON)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_JSON, "utf8"));
      keep = (Array.isArray(prev.lots) ? prev.lots : []).filter((l) => l.region !== "korea");
      console.log("Keeping non-Korea lots:", keep.length);
    } catch {
      keep = [];
    }
  }

  const lots = [...keep, ...koreaLots].sort(
    (a, b) => (b.currentBid || 0) - (a.currentBid || 0),
  );

  const out = {
    generatedAt: new Date().toISOString(),
    source: "generated-lots + encar_catalog.json",
    counts: {
      total: lots.length,
      usa: lots.filter((l) => l.region === "usa").length,
      uk: lots.filter((l) => l.region === "uk").length,
      korea: lots.filter((l) => l.region === "korea").length,
      copart: lots.filter((l) => l.source === "copart").length,
      iaai: lots.filter((l) => l.source === "iaai").length,
      copart_uk: lots.filter((l) => l.source === "copart_uk").length,
      encar: lots.filter((l) => l.source === "encar").length,
      withPhotos: lots.filter((l) => l.imageUrl).length,
    },
    lots,
  };

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(out));
  console.log("Wrote", OUT_JSON);
  console.log("Counts", out.counts);

  const sync = spawnSync(process.execPath, [join(__dirname, "sync-catalog-from-lots.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (sync.status !== 0) {
    console.warn("catalog sync exited", sync.status);
  }
}

main();
