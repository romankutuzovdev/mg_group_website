/**
 * Cloudflare Pages Function — HTTPS reverse proxy to the Windows API.
 * Browser: https://mg-group.by/api/v1/... → upstream Windows API.
 *
 * Workers cannot fetch raw IPs (1003). Use nip.io hostname → IP.
 * Ignore env API_URL when it points at broken api.mg-group.by (CF 1016).
 */
const UPSTREAM = "http://91.149.133.54.nip.io";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "x-forwarded-proto",
  "x-real-ip",
  "content-length",
]);

function resolveUpstream(env) {
  const raw = String(env?.API_URL || env?.NEXT_PUBLIC_API_URL || UPSTREAM)
    .trim()
    .replace(/\/$/, "");
  if (!raw || /api\.mg-group\.by/i.test(raw) || /1016/.test(raw)) {
    return UPSTREAM;
  }
  if (/^https?:\/\/\d{1,3}(?:\.\d{1,3}){3}/i.test(raw)) {
    const ip = raw.replace(/^https?:\/\//i, "").replace(/[:/].*$/, "");
    return `http://${ip}.nip.io`;
  }
  return raw;
}

export async function onRequest(context) {
  // Always prefer working nip.io until api.mg-group.by has grey-cloud DNS
  const base = UPSTREAM;
  const incoming = new URL(context.request.url);
  const targetUrl = `${base}${incoming.pathname}${incoming.search}`;

  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": incoming.origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers":
          context.request.headers.get("Access-Control-Request-Headers") ||
          "Authorization, Content-Type",
      },
    });
  }

  // Uvicorn often rejects HEAD — use GET for health probes
  const method = context.request.method === "HEAD" ? "GET" : context.request.method;

  const headers = new Headers();
  for (const [key, value] of context.request.headers.entries()) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  headers.set("Accept", "application/json");
  headers.set("Host", new URL(base).host);

  const init = {
    method,
    headers,
    redirect: "manual",
    cf: { cacheTtl: 0 },
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = context.request.body;
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err) {
    return new Response(
      JSON.stringify({
        detail: "API proxy unreachable",
        upstream: base,
        error: String(err?.message || err),
      }),
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  // CF error pages (1016 etc.) — surface as JSON so the cabinet UI can show a real message
  const ctype = upstream.headers.get("content-type") || "";
  if (upstream.status >= 500 && ctype.includes("text/html")) {
    return new Response(
      JSON.stringify({
        detail: "Upstream API DNS/proxy error",
        upstream: base,
        status: upstream.status,
        hint: "Set API_URL to http://91.149.133.54.nip.io or fix api.mg-group.by DNS (A + grey cloud)",
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": incoming.origin,
        },
      },
    );
  }

  const outHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    outHeaders.set(key, value);
  }
  outHeaders.set("Access-Control-Allow-Origin", incoming.origin || "*");
  outHeaders.set("Access-Control-Allow-Credentials", "true");
  outHeaders.set("Vary", "Origin");
  outHeaders.set("X-MG-Proxy-Upstream", base);

  const body =
    context.request.method === "HEAD" ? null : upstream.body;

  return new Response(body, {
    status: upstream.status === 405 && context.request.method === "HEAD" ? 200 : upstream.status,
    headers: outHeaders,
  });
}
