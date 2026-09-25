/**
 * Cloudflare Pages Function — proxies Copart CDN images when needed.
 * Prefer direct CDN URLs in the app; use this via NEXT_PUBLIC_CF_IMAGE_PROXY
 * if a browser environment blocks hotlinking.
 *
 * GET /api/lot-image?u=https://cs.copart.com/...
 */
const ALLOWED_HOST =
  /^cs\.copart\.(com|co\.uk)$|^c-static\.copart\.com$/i;

export async function onRequestGet(context) {
  const reqUrl = new URL(context.request.url);
  const target = reqUrl.searchParams.get("u")?.trim();

  if (!target) {
    return new Response("Bad request", { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Bad URL", { status: 400 });
  }

  if (!ALLOWED_HOST.test(parsed.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const isUk = /\.co\.uk$/i.test(parsed.hostname) || /copart\.co\.uk/i.test(target);
  const upstream = await fetch(target, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: isUk ? "https://www.copart.co.uk/" : "https://www.copart.com/",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    cf: { cacheTtl: 86400, cacheEverything: true },
  });

  if (!upstream.ok) {
    return new Response("Upstream error", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") || "image/jpeg");
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(upstream.body, { status: 200, headers });
}
