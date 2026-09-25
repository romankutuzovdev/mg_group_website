#!/usr/bin/env node
/**
 * Import root copart_catalog.json → lib/auctions/generated-lots.json
 *
 * Default: keep Copart CDN URLs (site serves them via Cloudflare Pages Function
 * `/api/lot-image`). Optional `--download` saves JPGs under public/auctions/lots/.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "copart_catalog.json");
const OUT_JSON = join(ROOT, "lib", "auctions", "generated-lots.json");
const PUBLIC_LOTS = join(ROOT, "public", "auctions", "lots");

const CONCURRENCY = 16;
const DO_DOWNLOAD = process.argv.includes("--download");

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

function categoryToTitle(cat) {
  const c = String(cat || "").toUpperCase();
  if (c === "B" || c === "A") {
    return { titleType: "parts_only", titleLabel: `Category ${c}` };
  }
  if (c === "S" || c === "N") {
    return { titleType: "salvage", titleLabel: `Category ${c}` };
  }
  return { titleType: "salvage", titleLabel: c ? `Category ${c}` : "Salvage" };
}

function toAuctionDate(saleDate) {
  if (!saleDate) return new Date(Date.now() + 3 * 864e5).toISOString();
  if (/T/.test(saleDate)) return saleDate;
  return `${saleDate}T12:00:00Z`;
}

async function downloadImage(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 2000) return true;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.copart.co.uk/",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  if (!res.ok || !res.body) return false;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return existsSync(dest) && statSync(dest).size > 2000;
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function mapLot(raw) {
  const lotId = String(raw.lot_id);
  const year = Number(raw.year) || 2018;
  const make = titleCase(raw.make || "Unknown");
  const model = titleCase(raw.model || "Unknown");
  const { titleType, titleLabel } = categoryToTitle(raw.category);
  const remoteImages = Array.isArray(raw.images)
    ? raw.images.filter((u) => typeof u === "string" && u.startsWith("http"))
    : [];
  if (!remoteImages.length) return null;

  const slug = `copart-uk-${year}-${slugify(make)}-${slugify(model)}-${lotId}`;
  const imageUrls = DO_DOWNLOAD
    ? remoteImages.map((_, idx) => `/auctions/lots/${lotId}_${idx}.jpg`)
    : remoteImages;

  return {
    id: `uk-${lotId}`,
    slug,
    region: "uk",
    source: "copart_uk",
    lotNumber: lotId,
    vin: raw.vin || "*****************",
    make,
    model,
    year,
    titleType,
    titleLabel,
    primaryDamage: titleCase(raw.primary_damage || "Unknown"),
    secondaryDamage: raw.secondary_damage ? titleCase(raw.secondary_damage) : undefined,
    odometer: Math.round(Number(raw.odometer) || 0),
    odometerUnit: "mi",
    currentBid: Math.round(Number(raw.bid) || 0),
    currency: raw.currency === "USD" ? "USD" : "GBP",
    location: raw.location || "UK",
    auctionDate: toAuctionDate(raw.sale_date),
    imageUrl: imageUrls[0],
    imageUrls,
    remoteImages,
    transmission: mapTrans(raw.transmission),
    fuel: mapFuel(raw.fuel),
    drive: mapDrive(raw.drive),
    exteriorColor: raw.color ? titleCase(raw.color) : "—",
    hasKeys: String(raw.keys || "").toUpperCase() === "YES",
    runsDrives: false,
    engine: mapEngine(raw.engine),
    bodyStyle: cleanBody(raw.body_style),
    category: raw.category || undefined,
    lotUrl: raw.url || `https://www.copart.co.uk/lot/${lotId}`,
  };
}

async function main() {
  if (!existsSync(SRC)) {
    console.error("Missing", SRC);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(SRC, "utf8"));
  const rawLots = Array.isArray(payload.lots) ? payload.lots : [];
  console.log("Source lots:", rawLots.length);

  let lots = rawLots.map(mapLot).filter(Boolean);
  console.log(DO_DOWNLOAD ? "Mode: download local JPGs" : "Mode: CDN URLs (no local photos)");

  if (DO_DOWNLOAD) {
    mkdirSync(PUBLIC_LOTS, { recursive: true });
    const jobs = [];
    for (const lot of lots) {
      (lot.remoteImages || []).forEach((url, idx) => {
        jobs.push({ url, dest: join(PUBLIC_LOTS, `${lot.lotNumber}_${idx}.jpg`), lot });
      });
    }
    console.log("Downloading images:", jobs.length);
    let ok = 0;
    let fail = 0;
    await mapPool(jobs, CONCURRENCY, async (job, idx) => {
      try {
        const saved = await downloadImage(job.url, job.dest);
        if (saved) ok += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }
      if ((idx + 1) % 50 === 0 || idx + 1 === jobs.length) {
        console.log(`  ${idx + 1}/${jobs.length} (ok ${ok}, fail ${fail})`);
      }
    });
    console.log("Download done:", { ok, fail });

    lots = lots.filter((lot) => {
      const first = join(PUBLIC_LOTS, `${lot.lotNumber}_0.jpg`);
      return existsSync(first) && statSync(first).size > 2000;
    });
  }

  lots.sort((a, b) => (b.currentBid || 0) - (a.currentBid || 0));

  const cleanLots = lots.map((lot) => {
    const { remoteImages, ...rest } = lot;
    const out = { ...rest };
    for (const k of Object.keys(out)) {
      if (out[k] === undefined || out[k] === "") delete out[k];
    }
    return out;
  });

  /** Keep existing USA lots (Bid.cars) when re-importing Copart UK. */
  let keepUsa = [];
  if (existsSync(OUT_JSON)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_JSON, "utf8"));
      keepUsa = (Array.isArray(prev.lots) ? prev.lots : []).filter((l) => l.region === "usa");
      console.log("Keeping USA lots:", keepUsa.length);
    } catch {
      keepUsa = [];
    }
  }

  const merged = [...cleanLots, ...keepUsa].sort(
    (a, b) => (b.currentBid || 0) - (a.currentBid || 0),
  );

  const out = {
    generatedAt: new Date().toISOString(),
    source: keepUsa.length
      ? "copart_catalog.json + bidcars_catalog.json"
      : "copart_catalog.json",
    counts: {
      total: merged.length,
      copart_uk: merged.filter((l) => l.source === "copart_uk").length,
      copart: merged.filter((l) => l.source === "copart").length,
      iaai: merged.filter((l) => l.source === "iaai").length,
      usa: merged.filter((l) => l.region === "usa").length,
      uk: merged.filter((l) => l.region === "uk").length,
      withPhotos: merged.filter((l) => l.imageUrl).length,
    },
    lots: merged,
  };

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(out));
  console.log("Wrote", OUT_JSON);
  console.log("Counts", out.counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
