/**
 * Cloudflare Pages Function — proxies auction CDNs for visitors without VPN
 * (BY / blocked Copart·IAAI). Production on Vercel uses the Windows FastAPI
 * `/api/lot-image` instead; this stays for legacy Pages deploys.
 *
 * GET /api/lot-image?u=https://...
 */
const ALLOWED_HOST =
  /^cs\.copart\.(com|co\.uk)$|^c-static\.copart\.(com|co\.uk)$|^(?:.*\.)?iaai\.com$|^(?:.*\.)?anvisimages\.com$|^(?:.*\.)?encar\.com$/i;

const JUNK =
  /\.svg(?:$|\?)|\/content\/[a-z]{2}\.svg|www\.copart\.(?:com|co\.uk)\/content\/|\bflag\b|\/logo|sprite|1x1|pixel/i;

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

  if (JUNK.test(target)) {
    return new Response("Not a lot photo", { status: 404 });
  }

  if (!ALLOWED_HOST.test(parsed.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const isUk = /\.co\.uk$/i.test(parsed.hostname) || /copart\.co\.uk/i.test(target);
  const referer = isUk
    ? "https://www.copart.co.uk/"
    : /iaai|anvis/i.test(parsed.hostname)
      ? "https://www.iaai.com/"
      : /encar/i.test(parsed.hostname)
        ? "https://www.encar.com/"
        : "https://www.copart.com/";

  const upstream = await fetch(target, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: referer,
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
