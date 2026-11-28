import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Pages Functions are ES modules even though this Next project uses CommonJS.
const source = await readFile(new URL("../functions/auctions/[[slug]].js", import.meta.url), "utf8");
const { onRequest } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const template = '<header>MG.GROUP</header><h1>__MG_LOT_name__</h1><script type="application/json">{"auctionPage":null}</script>';
const page = {
  lot: { slug: "ford-12" },
  preview: { name: "Ford </script> & GT", canonical: "https://mg-group.by/auctions/ford-12/" },
};

function request(path, method = "GET") {
  return onRequest({
    request: new Request(new URL(path, "https://mg-group.by"), { method }),
    env: {
      API_URL: "https://catalog.example",
      ASSETS: { async fetch(url) {
        assert.equal(url.pathname, "/auctions/__live__/");
        return new Response(template);
      } },
    },
    next: () => new Response("Unmodified static asset"),
  });
}

test("Cloudflare same-build shell, safe bootstrap, HEAD, and canonical aliases", async t => {
  t.mock.method(globalThis, "fetch", async url => {
    assert.match(url, /^https:\/\/catalog\.example\/api\/v1\/lots\/(ford-12|id-12)\/page$/);
    return Response.json(page);
  });
  const response = await request("/auctions/ford-12/?mode=kit");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>Ford &lt;\/script&gt; &amp; GT<\/h1>/);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.deepEqual(JSON.parse(html.match(/application\/json">(.*?)<\/script>/)[1]).auctionPage, page);
  const head = await request("/auctions/ford-12/", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const alias = await request("/auctions/id-12/?mode=kit");
  assert.equal(alias.status, 308);
  assert.equal(alias.headers.get("Location"), "https://mg-group.by/auctions/ford-12/?mode=kit");
});

test("Cloudflare returns 404 only for missing lots, and 503 on an outage", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("", { status: 404 }));
  assert.equal((await request("/auctions/removed/")).status, 404);
  fetchMock.mock.mockImplementation(async () => new Response("", { status: 502 }));
  assert.equal((await request("/auctions/ford-12/")).status, 503);
  assert.equal((await request("/auctions/__live__/index.html")).status, 404);
  assert.equal(await (await request("/auctions/damage-map-sedan.png")).text(), "Unmodified static asset");
});
