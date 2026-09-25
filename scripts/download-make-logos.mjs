#!/usr/bin/env node
/**
 * Download car brand logos into public/catalog/makes/
 * Source: https://github.com/vehiclespecs/brand-logos (jsDelivr CDN)
 * Then updates logo paths in lib/catalog/generated.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public/catalog/makes");
const CATALOG_PATH = join(ROOT, "lib/catalog/generated.json");
const CDN = "https://cdn.jsdelivr.net/gh/vehiclespecs/brand-logos@main";
const BRANDS_URL = `${CDN}/brands.json`;

/** Map our catalog slug → brands.json key (when names differ) */
const SLUG_TO_BRAND = {
  acura: "Acura",
  aito: "AITO",
  arcfox: "Arcfox",
  "aston-martin": "Aston Martin",
  audi: "Audi",
  avatr: "Avatr",
  baw: "BAW",
  bmw: "BMW",
  buick: "Buick",
  byd: "BYD",
  cadillac: "Cadillac",
  changan: "ChangAn",
  chevrolet: "Chevrolet",
  chrysler: "Chrysler",
  citroen: "Citroen",
  dfsk: "DFSK",
  dodge: "Dodge",
  ford: "Ford",
  gac: "GAC",
  geely: "Geely",
  genesis: "Genesis",
  gmc: "GMC",
  haval: "Haval",
  honda: "Honda",
  hongqi: "Hongqi",
  hummer: "Hummer",
  hyundai: "Hyundai",
  infiniti: "Infiniti",
  iveco: "Iveco",
  jac: "JAC",
  jaguar: "Jaguar",
  jeep: "Jeep",
  kia: "Kia",
  lamborghini: "Lamborghini",
  "land-rover": "Land Rover",
  leapmotor: "Leapmotor",
  lexus: "Lexus",
  "li-auto": "Li",
  lincoln: "Lincoln",
  lotus: "Lotus",
  maserati: "Maserati",
  mazda: "Mazda",
  "mercedes-benz": "Mercedes-Benz",
  mg: "MG",
  mini: "Mini",
  mitsubishi: "Mitsubishi",
  nissan: "Nissan",
  opel: "Opel",
  peugeot: "Peugeot",
  polestar: "Polestar",
  pontiac: "Pontiac",
  porsche: "Porsche",
  ram: "Ram",
  rivian: "Rivian",
  "rolls-royce": "Rolls-Royce",
  scion: "Scion",
  subaru: "Subaru",
  tank: "Tank",
  tesla: "Tesla",
  toyota: "Toyota",
  volkswagen: "Volkswagen",
  volvo: "Volvo",
  voyah: "Voyah",
  wuling: "Wuling",
  xiaomi: "Xiaomi",
  xpeng: "XPeng",
  zeekr: "Zeekr",
  // Chinese / niche — try common keys; may miss
  jetour: "Jetour",
  jetta: "Jetta",
  foton: "Foton",
  faw: "FAW",
  denza: "Denza",
  seres: "Seres",
};

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "MG.GROUP-catalog-logo-sync/1.0" },
  });
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const brandsRes = await fetch(BRANDS_URL);
  if (!brandsRes.ok) {
    console.error("Failed to fetch brands.json", brandsRes.status);
    process.exit(1);
  }
  /** @type {Record<string, string>} */
  const brands = await brandsRes.json();

  // Build reverse lookup by normalized name
  const byNorm = {};
  for (const [name, file] of Object.entries(brands)) {
    byNorm[name.toLowerCase().replace(/[^a-z0-9]+/g, "")] = { name, file };
  }

  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  let ok = 0;
  let miss = 0;
  const missing = [];

  for (const make of Object.values(catalog.makes)) {
    const brandKey = SLUG_TO_BRAND[make.slug] || make.name;
    let entry = brands[brandKey];
    if (!entry) {
      const hit = byNorm[brandKey.toLowerCase().replace(/[^a-z0-9]+/g, "")];
      if (hit) entry = hit.file;
    }
    if (!entry) {
      // fuzzy: slug match in filenames
      const slugFile = `${make.slug}-logo.svg`;
      const slugPng = `${make.slug}-logo.png`;
      const tryNames = Object.values(brands);
      entry = tryNames.find((f) => f === slugFile || f === slugPng);
    }

    if (!entry) {
      miss++;
      missing.push(make.slug);
      continue;
    }

    const ext = entry.endsWith(".png") ? "png" : "svg";
    const outName = `${make.slug}.${ext}`;
    const outPath = join(OUT_DIR, outName);
    const url = `${CDN}/${entry}`;

    if (!existsSync(outPath)) {
      const buf = await fetchBuffer(url);
      if (!buf || buf.length < 50) {
        miss++;
        missing.push(make.slug);
        continue;
      }
      writeFileSync(outPath, buf);
      console.log("saved", outName, `(${buf.length}b)`);
    } else {
      console.log("skip", outName);
    }

    make.logo = `/catalog/makes/${outName}`;
    ok++;
  }

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
  console.log(JSON.stringify({ ok, miss, missing }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
