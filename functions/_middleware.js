import { liveSitemap } from "../lib/seo/sitemap-proxy.mjs";

export async function onRequest(context) {
  const response = await liveSitemap(context.request, context.env.API_URL || context.env.NEXT_PUBLIC_API_URL);
  return response || context.next();
}
