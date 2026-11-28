/** Fill this Cloudflare build's Next.js shell with current public catalog data. */
const DEFAULT_API = "http://91.149.133.54.nip.io";

function apiBase(env) {
  let raw = String(env?.API_URL || env?.NEXT_PUBLIC_API_URL || DEFAULT_API).trim().replace(/\/$/, "");
  if (!raw || /api\.mg-group\.by/i.test(raw)) return DEFAULT_API;
  if (/^https?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/i.test(raw)) {
    const url = new URL(raw);
    raw = `http://${url.hostname}.nip.io${url.port ? ":" + url.port : ""}`;
  }
  return raw;
}

function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, char => entities[char]);
}

function notice(title, status, method) {
  return new Response(method === "HEAD" ? null :
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title} | MG.GROUP</title></head><body><main><h1>${title}</h1><a href="/avto/">К каталогу авто</a></main></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/auctions/" || path === "/auctions" || path.startsWith("/auctions/lots/") ||
      path === "/auctions/damage-map-sedan.png") return next();
  const match = path.match(/^\/auctions\/([^/]+)(?:\/index\.html|\/)?$/);
  const missing = () => notice("Лот не найден", 404, request.method);
  if (!match) return missing();

  let slug;
  try { slug = decodeURIComponent(match[1]); } catch { return missing(); }
  if (slug === "__live__" || slug.includes("/")) return missing();

  try {
    const res = await fetch(`${apiBase(env)}/api/v1/lots/${encodeURIComponent(slug)}/page`, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 404 || res.status === 410) return missing();
    if (!res.ok) throw new Error("Catalog unavailable");
    const page = await res.json();
    const canonicalPath = new URL(page.preview.canonical).pathname;
    if (path !== canonicalPath) return Response.redirect(new URL(canonicalPath + url.search, url), 308);

    const asset = await env.ASSETS.fetch(new URL("/auctions/__live__/", url));
    if (!asset.ok) throw new Error("Missing auction template");
    const template = await asset.text();
    if (!template.includes('"auctionPage":null') || !template.includes("__MG_LOT_name__")) {
      throw new Error("Invalid auction template");
    }

    const json = JSON.stringify(page).replace(/</g, "\\u003c");
    const html = template.replace(/__MG_LOT_([a-zA-Z]+)__|"auctionPage":null/g, (token, key) =>
      key ? escapeHtml(page.preview[key]) : `"auctionPage":${json}`);
    return new Response(request.method === "HEAD" ? null : html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch {
    return notice("Каталог временно недоступен", 503, request.method);
  }
}
