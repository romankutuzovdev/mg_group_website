/**
 * Cloudflare Pages Function — SSR HTML for auction lot pages.
 * Next static export skips /auctions/* (SEO_AUCTION_SSG_LIMIT=0); this keeps SEO fresh.
 *
 * Routes: /auctions/:slug and /auctions/:slug/
 */
const SITE = "https://www.multiglobalgroup.com";
// Hostname required — Workers cannot fetch raw IPs (CF error 1003).
const DEFAULT_API = "http://91.149.133.54.nip.io";

const REGION_LABELS = {
  usa: "США",
  uk: "Великобритания",
  korea: "Корея",
  china: "Китай",
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n} ${currency || "USD"}`;
  }
}

function formatDate(iso) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function apiBase(env) {
  let raw = String(env?.API_URL || env?.NEXT_PUBLIC_API_URL || DEFAULT_API).trim().replace(/\/$/, "");
  if (!raw || /api\.mg-group\.by/i.test(raw)) {
    raw = DEFAULT_API;
  }
  if (/^https?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/i.test(raw)) {
    const host = raw.replace(/^https?:\/\//i, "").replace(/:\d+$/, "");
    raw = `http://${host}.nip.io`;
  }
  return raw;
}

function extractSlug(request, params) {
  const fromParams = params?.slug ?? params?.path;
  if (typeof fromParams === "string" && fromParams) return fromParams.replace(/\/+$/, "");
  if (Array.isArray(fromParams) && fromParams[0]) return String(fromParams[0]).replace(/\/+$/, "");
  const pathname = new URL(request.url).pathname;
  const m = pathname.match(/^\/auctions\/([^/]+)\/?$/i);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

function notFoundHtml(slug) {
  const title = "Лот не найден | MG.GROUP";
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)}</title>
  <meta name="robots" content="noindex"/>
  <link rel="canonical" href="${SITE}/avto/"/>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#fafafa;color:#18181b}
    main{max-width:40rem;margin:4rem auto;padding:0 1.25rem}
    a{color:#16a34a}
  </style>
</head>
<body>
  <main>
    <h1>Лот не найден</h1>
    <p>Страница${slug ? ` «${esc(slug)}»` : ""} недоступна или торги уже завершены.</p>
    <p><a href="/avto/">← К каталогу авто</a></p>
  </main>
</body>
</html>`;
}

function lotHtml(lot) {
  const path = `/auctions/${lot.slug}/`;
  const url = `${SITE}${path}`;
  const title = `${lot.year} ${lot.make} ${lot.model} | MG.GROUP`;
  const description = `Лот #${lot.lotNumber}. ${lot.primaryDamage || "Аукцион"}. Ставка от ${money(lot.currentBid, lot.currency)}.`;
  const image =
    lot.imageUrl && /^https?:\/\//i.test(lot.imageUrl)
      ? lot.imageUrl
      : `${SITE}/logo.png`;
  const region =
    REGION_LABELS[lot.region] || String(lot.region || "").toUpperCase();
  const catalogHref =
    lot.region === "uk"
      ? "/mashinokomplekt/uk/#lots"
      : `/avto/${lot.region || "usa"}/#lots`;
  const catalogLabel =
    lot.region === "uk"
      ? "← К комплектам из Англии"
      : `← К каталогу авто из ${region}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: `${lot.year} ${lot.make} ${lot.model}`,
    brand: { "@type": "Brand", name: lot.make },
    model: lot.model,
    vehicleModelDate: String(lot.year),
    color: lot.exteriorColor || undefined,
    vehicleIdentificationNumber: lot.vin || undefined,
    image,
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: lot.currency || "USD",
      price: lot.currentBid,
      availability: "https://schema.org/InStock",
      ...(lot.auctionDate
        ? { priceValidUntil: String(lot.auctionDate).slice(0, 10) }
        : {}),
    },
  };

  const rows = [
    ["Повреждение (основное)", lot.primaryDamage],
    ["Повреждение (доп.)", lot.secondaryDamage],
    ["Title", lot.titleLabel],
    ["Пробег", lot.odometer != null ? `${lot.odometer} ${lot.odometerUnit || "mi"}` : null],
    ["Двигатель", lot.engine],
    ["Кузов", lot.bodyStyle],
    ["КПП", lot.transmission],
    ["Топливо", lot.fuel],
    ["Привод", lot.drive],
    ["Цвет", lot.exteriorColor],
    ["Ключи", typeof lot.hasKeys === "boolean" ? (lot.hasKeys ? "Да" : "Нет") : null],
    ["Run & Drive", typeof lot.runsDrives === "boolean" ? (lot.runsDrives ? "Да" : "Нет") : null],
    ["Локация", lot.location],
  ]
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(
      ([k, v]) =>
        `<div class="row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`,
    )
    .join("");

  const tg = `https://t.me/Yury_MG_Global?text=${encodeURIComponent(
    `Здравствуйте! Нужен Carfax / история авто по лоту #${lot.lotNumber}: ${lot.year} ${lot.make} ${lot.model}, VIN ${lot.vin || ""}.`,
  )}`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}"/>
  <link rel="canonical" href="${esc(url)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:locale" content="ru_RU"/>
  <meta property="og:site_name" content="MG.GROUP"/>
  <meta property="og:title" content="${esc(title)}"/>
  <meta property="og:description" content="${esc(description)}"/>
  <meta property="og:url" content="${esc(url)}"/>
  <meta property="og:image" content="${esc(image)}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(description)}"/>
  <meta name="twitter:image" content="${esc(image)}"/>
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
  <style>
    :root{--accent:#16a34a;--fg:#18181b;--muted:#71717a;--border:#e4e4e7;--bg:#fafafa;--card:#fff}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg);line-height:1.5}
    a{color:var(--accent);text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:72rem;margin:0 auto;padding:1.25rem}
    .top{padding:1.25rem 0;border-bottom:1px solid var(--border);background:#fff}
    .badge{display:inline-block;padding:.15rem .5rem;border-radius:.375rem;background:#dcfce7;color:#166534;font-size:.75rem;font-weight:600;margin-right:.35rem}
    .muted{color:var(--muted);font-size:.875rem}
    h1{margin:.75rem 0 .25rem;font-size:clamp(1.5rem,3vw,2rem);line-height:1.2}
    .grid{display:grid;gap:1.25rem;margin-top:1.5rem}
    @media(min-width:960px){.grid{grid-template-columns:1.6fr .9fr}}
    .card{background:var(--card);border:1px solid var(--border);border-radius:.75rem;padding:1.25rem}
    .hero{aspect-ratio:16/10;overflow:hidden;border-radius:.75rem;border:1px solid var(--border);background:#f4f4f5}
    .hero img{width:100%;height:100%;object-fit:cover;display:block}
    .price{font-size:1.875rem;font-weight:700;color:#166534;margin:.25rem 0}
    .row{display:flex;justify-content:space-between;gap:1rem;padding:.65rem 0;border-bottom:1px solid var(--border);font-size:.875rem}
    .row:last-child{border-bottom:0}
    .row span{color:var(--muted)}
    .btn{display:block;text-align:center;padding:.75rem 1rem;border-radius:.5rem;font-weight:600;text-decoration:none!important}
    .btn-primary{background:var(--accent);color:#fff}
    .btn-secondary{background:#f4f4f5;color:var(--fg);margin-top:.5rem}
    .datebox{margin-top:1rem;padding:.75rem;border-radius:.5rem;background:#dcfce7;font-size:.875rem}
  </style>
</head>
<body>
  <header class="top">
    <div class="wrap">
      <a href="${esc(catalogHref)}">${esc(catalogLabel)}</a>
      <div style="margin-top:.75rem">
        <span class="badge">${esc(region)}</span>
        <span class="badge" style="background:#f4f4f5;color:#52525b">#${esc(lot.lotNumber)}</span>
      </div>
      <h1>${esc(lot.year)} ${esc(lot.make)} ${esc(lot.model)}</h1>
      ${lot.vin ? `<p class="muted" style="font-family:ui-monospace,monospace">${esc(lot.vin)}</p>` : ""}
    </div>
  </header>
  <main class="wrap grid">
    <section>
      <div class="hero">
        <img src="${esc(image)}" alt="${esc(`${lot.year} ${lot.make} ${lot.model}`)}" width="1200" height="750"/>
      </div>
      <div class="card" style="margin-top:1.25rem">
        <h2 style="margin:0 0 .5rem;font-size:1.125rem">Характеристики</h2>
        ${rows}
      </div>
    </section>
    <aside>
      <div class="card">
        <p class="muted" style="margin:0">Ставка на аукционе</p>
        <p class="price">${esc(money(lot.currentBid, lot.currency))}</p>
        ${
          lot.buyNowPrice
            ? `<p class="muted">Buy Now: <strong style="color:var(--fg)">${esc(money(lot.buyNowPrice, lot.currency))}</strong></p>`
            : ""
        }
        <div class="datebox">
          <strong>Дата торгов</strong>
          <div>${esc(formatDate(lot.auctionDate))}</div>
        </div>
        <a class="btn btn-primary" href="/contacts/" style="margin-top:1.25rem">Оставить заявку</a>
        <a class="btn btn-secondary" href="${esc(tg)}" target="_blank" rel="noopener noreferrer">Запросить историю авто</a>
        <a class="btn btn-secondary" href="/cabinet/">Калькулятор в кабинете</a>
      </div>
    </aside>
  </main>
</body>
</html>`;
}

export async function onRequest(context) {
  const slug = extractSlug(context.request, context.params);
  if (!slug) {
    return Response.redirect(new URL("/avto/", context.request.url), 302);
  }

  const base = apiBase(context.env);
  let lot = null;
  try {
    const res = await fetch(`${base}/api/v1/lots/${encodeURIComponent(slug)}`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) lot = await res.json();
  } catch {
    lot = null;
  }

  if (!lot?.slug) {
    return new Response(notFoundHtml(slug), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  return new Response(lotHtml(lot), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
