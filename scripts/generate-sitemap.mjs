#!/usr/bin/env node
// Read the build output so redirects, noindex pages and missing getStaticPaths
// entries cannot accidentally become sitemap URLs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import htmlParser from "next/dist/compiled/node-html-parser/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://mg-group.by";

function* htmlFiles(dir, prefix = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) {
      // All auction detail URLs come from the current catalog at request time.
      if (entry.name.startsWith("_") || relative === "auctions") continue;
      yield* htmlFiles(filename, relative + "/");
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      yield { filename, relative };
    }
  }
}

function addBlockingCatalogPages(urls, { catalog, routes }) {
  // These three getStaticProps handlers accept exactly the region/make/model
  // combinations in generated.json. City/region parents are verified HTML.
  const blocking = (pattern) => routes[pattern]?.fallback === null;
  const parents = [...urls].filter((url) => /^\/gorod\/[^/]+\/[^/]+\/$/.test(new URL(url).pathname));
  for (const [slug, make] of Object.entries(catalog.makes)) {
    if (make.slug !== slug) continue;
    for (const region of make.regions) {
      const base = SITE + "/avto/" + region + "/";
      if (!catalog.regions[region] || !urls.has(base)) continue;
      const makeUrl = base + slug + "/";
      if (blocking("/avto/[region]/[make]")) urls.add(makeUrl);
      if (blocking("/avto/[region]/[make]/[model]")) {
        for (const model of make.models) urls.add(makeUrl + model.slug + "/");
      }
      if (blocking("/gorod/[city]/[region]/[make]")) {
        for (const parent of parents) {
          if (parent.endsWith("/" + region + "/")) urls.add(parent + slug + "/");
        }
      }
    }
  }
}

export function staticSitemap(buildDir, blockingCatalog) {
  const urls = new Set();
  for (const { filename, relative } of htmlFiles(buildDir)) {
    const page = relative.replace(/\.html$/, "").replace(/(^|\/)index$/, "");
    const pathname = "/" + page + (page && !page.endsWith("/") ? "/" : "");
    const html = fs.readFileSync(filename, "utf8");
    const end = html.indexOf("</head>");
    if (end < 0) continue;
    const head = htmlParser.parse(html.slice(0, end + 7));
    const blocked = head.querySelectorAll("meta[name]").some((meta) =>
      /^(robots|googlebot|yandex)$/i.test(meta.getAttribute("name")) &&
      /\b(noindex|none)\b/i.test(meta.getAttribute("content") || "")
    );
    const canonical = head.querySelector('link[rel="canonical"]')?.getAttribute("href");
    if (!blocked && canonical === SITE + pathname) urls.add(canonical);
  }
  if (!urls.has(SITE + "/")) {
    throw new Error("В сборке отсутствует главная страница с canonical https://mg-group.by/");
  }
  if (blockingCatalog) addBlockingCatalogPages(urls, blockingCatalog);

  const locs = [...urls].sort().map((url) =>
    '  <url><loc>' + url.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") + '</loc></url>'
  );
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    locs.join("\n") + '\n</urlset>\n';
}

export function writeSitemap(root, vercel) {
  const buildDir = path.join(root, vercel ? ".next/server/pages" : "out");
  const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  const catalog = vercel ? {
    catalog: readJson("lib/catalog/generated.json"),
    routes: readJson(".next/prerender-manifest.json").dynamicRoutes,
  } : undefined;
  const sitemap = staticSitemap(buildDir, catalog);
  for (const name of ["sitemap.xml", "sitemap-pages.xml"]) {
    const target = path.join(root, vercel ? "public" : "out", name);
    const temporary = target + "." + process.pid + ".tmp";
    fs.writeFileSync(temporary, sitemap);
    fs.renameSync(temporary, target);
  }
  return sitemap.match(/<url>/g).length;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const count = writeSitemap(ROOT, process.env.VERCEL === "1");
  console.log(`sitemap: ${count} страниц → ${SITE}/sitemap.xml`);
}
