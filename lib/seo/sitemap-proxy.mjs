// Only the index and numbered lot shards come from the catalog. Returning null
// lets the host serve its own build's static sitemap during an upstream outage.
export async function liveSitemap(request, apiOrigin, fetcher = fetch) {
  const { pathname } = new URL(request.url);
  const isIndex = pathname === "/sitemap.xml";
  if (!isIndex && !/^\/sitemap-auctions-[0-9]+\.xml$/.test(pathname)) return null;
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  try {
    const upstream = new URL(apiOrigin || "http://91.149.133.54.nip.io");
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(upstream.hostname)) upstream.hostname += ".nip.io";
    const url = new URL("/api/v1" + pathname, upstream);
    const response = await fetcher(url, {
      method: request.method,
      headers: { Accept: "application/xml" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok && /(?:application|text)\/xml/i.test(response.headers.get("Content-Type") || "")) {
      return new Response(response.body, {
        headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=180" },
      });
    }
    if (!isIndex && response.status === 404) return new Response(null, { status: 404 });
  } catch {
    // Upstream timeout, DNS failure, or a catalog node that has not been updated.
  }
  return isIndex ? null : new Response(null, { status: 503, headers: { "Retry-After": "180" } });
}
