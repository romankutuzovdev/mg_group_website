#!/usr/bin/env node
/**
 * Import root bidcars_catalog.json → merge USA lots into
 * lib/auctions/generated-lots.json (keeps existing Copart UK lots).
 *
 * Bid.cars CDN photos work in the browser — no local download.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "bidcars_catalog.json");
const OUT_JSON = join(ROOT, "lib", "auctions", "generated-lots.json");

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

function mapFuel(raw) {
  const f = String(raw || "").toUpperCase();
  if (!f) return "—";
  if (f.includes("DIESEL")) return "Diesel";
  if (f.includes("ELECTRIC") && f.includes("HYBRID")) return "Hybrid";
  if (f.startsWith("HYBRID")) return "Hybrid";
  if (f.includes("ELECTRIC")) return "Electric";
  if (f.includes("PETROL") || f.includes("GAS")) return "Gasoline";
  return titleCase(raw);
}

function mapTrans(raw) {
  const t = String(raw || "").toUpperCase();
  if (!t) return "—";
  if (t.includes("CVT")) return "CVT";
  if (t.includes("AUTO") || t.includes("S-AUTO") || t.includes("SEMI")) return "Automatic";
  if (t.includes("MANUAL")) return "Manual";
  return titleCase(raw);
}

function mapDrive(raw) {
  const d = String(raw || "").toUpperCase();
  if (!d || d.includes("AXLE") || d.includes("RIGID")) return "—";
  if (d.includes("4X4") || d.includes("4WD")) return "4x4";
  if (d.includes("AWD") || d.includes("ALL")) return "AWD";
  if (d.includes("RWD") || d.includes("REAR")) return "RWD";
  if (d.includes("FWD") || d.includes("FRONT")) return "FWD";
  return titleCase(raw);
}

function mapEngine(raw) {
  const s = String(raw || "").trim();
  if (!s) return undefined;
  const cc = s.match(/(\d{3,4})\s*cc/i);
  if (cc) {
    const liters = (Number(cc[1]) / 1000).toFixed(1).replace(/\.0$/, "");
    return `${liters}L`;
  }
  return s;
}

function cleanBody(raw) {
  const s = String(raw || "").trim();
  if (!s || /LOTFEATURE|^\['|\[\]/.test(s)) return undefined;
  return titleCase(s);
}

function extractVin(raw) {
  if (raw.vin && String(raw.vin).length >= 11) return String(raw.vin);
  const fromUrl = String(raw.url || "").match(/([A-HJ-NPR-Z0-9]{17})/i);
  if (fromUrl) return fromUrl[1].toUpperCase();
  return "*****************";
}

/** Bid.cars lot URLs: /lot/0-… = Copart, /lot/1-… = IAAI */
function detectSource(url) {
  const m = String(url || "").match(/\/lot\/(\d+)-/i);
  if (m && m[1] === "1") return "iaai";
  return "copart";
}

function toAuctionDate(saleDate) {
  if (!saleDate) return new Date(Date.now() + 5 * 864e5).toISOString();
  if (/T/.test(saleDate)) return saleDate;
  return `${saleDate}T12:00:00Z`;
}

function mapLot(raw) {
  const lotNumber = String(raw.display_lot_id || String(raw.lot_id || "").replace(/^bc-/i, ""));
  if (!lotNumber) return null;

  const year = Number(raw.year) || 2018;
  const make = titleCase(raw.make || "Unknown");
  const model = titleCase(raw.model || "Unknown");
  const source = detectSource(raw.url);
  const remoteImages = Array.isArray(raw.images)
    ? raw.images.filter((u) => typeof u === "string" && /bid\.cars/i.test(u))
    : [];
  if (!remoteImages.length) return null;

  const slug = `${source}-${year}-${slugify(make)}-${slugify(model)}-${lotNumber}`;

  return {
    id: `usa-${lotNumber}`,
    slug,
    region: "usa",
    source,
    lotNumber,
    vin: extractVin(raw),
    make,
    model,
    year,
    titleType: "salvage",
    titleLabel: "Salvage Certificate",
    primaryDamage: raw.primary_damage ? titleCase(raw.primary_damage) : "Unknown",
    secondaryDamage: raw.secondary_damage ? titleCase(raw.secondary_damage) : undefined,
    odometer: Math.round(Number(raw.odometer) || 0),
    odometerUnit: "mi",
    currentBid: Math.round(Number(raw.bid) || 0),
    currency: "USD",
    location: raw.location || raw.ship_from || "USA",
    auctionDate: toAuctionDate(raw.sale_date),
    imageUrl: remoteImages[0],
    imageUrls: remoteImages,
    transmission: mapTrans(raw.transmission ?? raw.transmission_type ?? raw.transmissionType),
    fuel: mapFuel(raw.fuel ?? raw.fuel_type ?? raw.fuelType),
    drive: mapDrive(raw.drive ?? raw.drive_type ?? raw.driveType ?? raw.drivetrain),
    exteriorColor: raw.color ? titleCase(raw.color) : "—",
    hasKeys: String(raw.keys || "").toUpperCase() === "YES",
    runsDrives: false,
    engine: mapEngine(raw.engine),
    bodyStyle: cleanBody(raw.body_style),
    lotUrl: raw.url || `https://bid.cars/en/lot/0-${lotNumber}`,
  };
}

function cleanLot(lot) {
  const out = { ...lot };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined || out[k] === "") delete out[k];
  }
  return out;
}

function main() {
  if (!existsSync(SRC)) {
    console.error("Missing", SRC);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(SRC, "utf8"));
  const rawLots = Array.isArray(payload.lots) ? payload.lots : [];
  console.log("Source Bid.cars lots:", rawLots.length);

  const usaLots = rawLots.map(mapLot).filter(Boolean).map(cleanLot);
  console.log("Mapped USA lots:", usaLots.length);

  /** Keep existing non-USA lots (Copart UK). */
  let keep = [];
  if (existsSync(OUT_JSON)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_JSON, "utf8"));
      keep = (Array.isArray(prev.lots) ? prev.lots : []).filter((l) => l.region !== "usa");
      console.log("Keeping non-USA lots:", keep.length);
    } catch {
      keep = [];
    }
  }

  const lots = [...keep, ...usaLots].sort(
    (a, b) => (b.currentBid || 0) - (a.currentBid || 0),
  );

  const out = {
    generatedAt: new Date().toISOString(),
    source: "copart_catalog.json + bidcars_catalog.json",
    counts: {
      total: lots.length,
      copart_uk: lots.filter((l) => l.source === "copart_uk").length,
      copart: lots.filter((l) => l.source === "copart").length,
      iaai: lots.filter((l) => l.source === "iaai").length,
      usa: lots.filter((l) => l.region === "usa").length,
      uk: lots.filter((l) => l.region === "uk").length,
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
