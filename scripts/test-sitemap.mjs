import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { staticSitemap, writeSitemap } from "./generate-sitemap.mjs";
import { liveSitemap } from "../lib/seo/sitemap-proxy.mjs";

test("includes canonical built routes and rejects redirects, drafts and stale lot pages", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mg-sitemap-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const add = (file, canonical, robots = "") => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `<html><head><link rel="canonical" href="${canonical}"/>
      <meta name="robots" content="${robots}"/></head><body></body></html>`);
  };
  const site = "https://mg-group.by";
  add("index.html", site + "/");
  add("mashinokomplekt/chto-takoe/index.html", site + "/mashinokomplekt/chto-takoe/");
  add("calculator/usa.html", site + "/calculator/usa/"); // Next server build layout
  add("alias/index.html", site + "/calculator/usa/");
  add("kuplennye-avto/index.html", site + "/kuplennye-avto/", "noindex, nofollow");
  add("auctions/ended/index.html", site + "/auctions/ended/");
  add("old.html", "https://www.multiglobalgroup.com/old/");
  const locations = [...staticSitemap(root).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locations, [site + "/", site + "/calculator/usa/", site + "/mashinokomplekt/chto-takoe/"]);
});

test("a clean build creates the map in the active host's deployment directory", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mg-sitemap-build-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "public"));
  const html = '<html><head><link rel="canonical" href="https://mg-group.by/"/></head></html>';
  for (const dir of ["out", ".next/server/pages"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, "index.html"), html);
  }
  fs.mkdirSync(path.join(root, "lib/catalog"), { recursive: true });
  fs.writeFileSync(path.join(root, "lib/catalog/generated.json"), JSON.stringify({
    regions: { usa: {} },
    makes: { ford: { slug: "ford", regions: ["usa", "uk"], models: [{ slug: "focus" }] } },
  }));
  fs.writeFileSync(path.join(root, ".next/prerender-manifest.json"), JSON.stringify({ dynamicRoutes: {
    "/avto/[region]/[make]": { fallback: null },
    "/avto/[region]/[make]/[model]": { fallback: false },
    "/gorod/[city]/[region]/[make]": { fallback: null },
  } }));
  for (const route of ["avto/usa", "gorod/minsk/usa"]) {
    const target = path.join(root, ".next/server/pages", route + ".html");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, html.replace("mg-group.by/", "mg-group.by/" + route + "/"));
  }
  assert.equal(writeSitemap(root, false), 1);
  assert.ok(fs.existsSync(path.join(root, "out/sitemap.xml")));
  assert.ok(!fs.existsSync(path.join(root, "public/sitemap.xml")));
  assert.equal(writeSitemap(root, true), 5);
  const generated = fs.readFileSync(path.join(root, "public/sitemap.xml"), "utf8");
  assert.match(generated, /\/avto\/usa\/ford\//);
  assert.match(generated, /\/gorod\/minsk\/usa\/ford\//);
  assert.doesNotMatch(generated, /\/uk\/|\/focus\//);
  assert.equal(fs.readFileSync(path.join(root, "public/sitemap-pages.xml"), "utf8"), generated);
});

test("edge hosts use catalog XML and retain their own static fallback", async () => {
  const root = new Request("https://mg-group.by/sitemap.xml");
  const shard = new Request("https://mg-group.by/sitemap-auctions-3.xml");
  const pages = new Request("https://mg-group.by/sitemap-pages.xml");
  const upstream = "http://192.0.2.20:8080";
  const fetchXml = (url) => {
    assert.equal(url.href, "http://192.0.2.20.nip.io:8080/api/v1/sitemap.xml");
    return new Response("<sitemapindex/>", { headers: { "Content-Type": "application/xml" } });
  };
  assert.equal(await (await liveSitemap(root, upstream, fetchXml)).text(), "<sitemapindex/>");
  const down = () => { throw Error("timeout"); };
  const missing = () => new Response(null, { status: 404 });
  assert.equal(await liveSitemap(root, upstream, down), null);
  assert.equal(await liveSitemap(root, upstream, missing), null);
  assert.equal(await liveSitemap(pages, upstream, () => assert.fail()), null);
  assert.equal((await liveSitemap(shard, upstream, down)).status, 503);
  assert.equal((await liveSitemap(shard, upstream, missing)).status, 404);
});
