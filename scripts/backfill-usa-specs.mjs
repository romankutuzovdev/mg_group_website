#!/usr/bin/env node
/**
 * Backfill empty transmission / fuel / drive on USA lots in generated-lots.json
 * using make/model/engine heuristics (Bid.cars / Copart list feeds often omit them).
 *
 * Run: node scripts/backfill-usa-specs.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LOTS_PATH = join(ROOT, "lib/auctions/generated-lots.json");

const EMPTY = new Set(["", "—", "-", "na", "n/a", "unknown", "null", "undefined"]);

function blank(value) {
  return !value || EMPTY.has(String(value).trim().toLowerCase());
}

function blobOf(lot) {
  return [lot.make, lot.model, lot.engine, lot.bodyStyle, lot.fuel, lot.drive, lot.transmission]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferFuel(lot) {
  if (!blank(lot.fuel)) return String(lot.fuel).trim();
  const blob = blobOf(lot);
  if (
    /\b(electric|battery|bev|ev\b|plug-?in)/i.test(blob) ||
    /\btesla\b/i.test(lot.make || "") ||
    /\b(leaf|bolt euv|bolt ev|ioniq 5|ioniq 6|mach-?e|id\.?\d|e-tron|model [3syx])\b/i.test(blob)
  ) {
    return "Electric";
  }
  if (/\b(hybrid|phev|plug.?in hybrid|hev)\b/i.test(blob)) return "Hybrid";
  if (/\b(diesel|tdi|duramax|powerstroke|cummins|ecodiesel)\b/i.test(blob)) return "Diesel";
  if (/\d+(\.\d+)?\s*l\b/i.test(lot.engine || "")) return "Gasoline";
  return lot.fuel || "—";
}

function inferDrive(lot) {
  if (!blank(lot.drive) && !/axle|rigid/i.test(String(lot.drive))) {
    return String(lot.drive).trim();
  }
  const blob = blobOf(lot);
  if (
    /\b(4x4|4wd|four[-\s]?wheel|awd|all[-\s]?wheel|quattro|xdrive|4matic|sh-?awd|super[-\s]?select|i-?mm|symmetrical)\b/i.test(
      blob,
    )
  ) {
    if (/\b(4x4|4wd|four[-\s]?wheel)\b/i.test(blob)) return "4WD";
    return "AWD";
  }
  if (/\b(rwd|rear[-\s]?wheel)\b/i.test(blob)) return "RWD";
  if (/\b(fwd|front[-\s]?wheel)\b/i.test(blob)) return "FWD";
  const model = (lot.model || "").toLowerCase();
  if (
    /\b(wrangler|bronco|4runner|tacoma|tundra|sierra|silverado|f-?15[0-9]|f-?25[0-9]|ram 1[5-9]|ram 25|ranger|gladiator|yukon|tahoe|suburban|sequoia|armada|titan|ridgeline|colorado|canyon)\b/.test(
      model,
    )
  ) {
    return "4WD";
  }
  if (
    /\b(dbx|cayenne|macan|x[1-7]\b|gle|glc|gls|gla|glb|q[3578]|rx|gx|lx|nx|mdx|rdx|highlander|pilot|pathfinder|explorer|expedition|traverse|atlas|tiguan|outback|forester|crosstrek|ascent|rav4|cr-?v|hr-?v|cx-?[5-9]|tucson|sportage|sorento|santa fe|palisade|telluride|grand cherokee|cherokee|compass|wagoneer|durango|aspen)\b/.test(
      model,
    )
  ) {
    return "AWD";
  }
  if (/\b(mustang|camaro|challenger|charger|corvette|911|cayman|supra|brz|86|miata|mx-?5)\b/.test(model)) {
    return "RWD";
  }
  if (/\b(civic|corolla|camry|accord|altima|sentra|elantra|sonata|jetta|passat|mazda3|mazda6|impreza|legacy)\b/.test(model)) {
    return "FWD";
  }
  return lot.drive || "—";
}

function inferTransmission(lot) {
  if (!blank(lot.transmission)) return String(lot.transmission).trim();
  const blob = blobOf(lot);
  if (/\b(cvt|xtronic|ecvt)\b/i.test(blob)) return "CVT";
  if (/\b(manual|mt\b|stick|6[-\s]?speed manual|5[-\s]?speed manual)\b/i.test(blob)) return "Manual";
  if (/\b(auto|a\/t|automatic|dct|dsg|pdk|tiptronic|s-?tronic)\b/i.test(blob)) return "Automatic";
  if ((lot.year ?? 0) >= 2000 && !blank(lot.engine)) return "Automatic";
  return lot.transmission || "—";
}

function main() {
  const payload = JSON.parse(readFileSync(LOTS_PATH, "utf8"));
  const lots = Array.isArray(payload.lots) ? payload.lots : [];
  let fuelN = 0;
  let driveN = 0;
  let transN = 0;

  for (const lot of lots) {
    if (lot.region !== "usa") continue;
    const nextFuel = inferFuel(lot);
    const nextDrive = inferDrive(lot);
    const nextTrans = inferTransmission(lot);
    if (blank(lot.fuel) && !blank(nextFuel)) {
      lot.fuel = nextFuel;
      fuelN += 1;
    }
    if ((blank(lot.drive) || /axle|rigid/i.test(String(lot.drive))) && !blank(nextDrive)) {
      lot.drive = nextDrive;
      driveN += 1;
    }
    if (blank(lot.transmission) && !blank(nextTrans)) {
      lot.transmission = nextTrans;
      transN += 1;
    }
  }

  payload.generatedAt = new Date().toISOString();
  payload.specsBackfill = {
    at: payload.generatedAt,
    fuel: fuelN,
    drive: driveN,
    transmission: transN,
  };
  writeFileSync(LOTS_PATH, JSON.stringify(payload));
  console.log("Backfilled USA specs:", { fuel: fuelN, drive: driveN, transmission: transN });
}

main();
