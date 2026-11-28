import { NextResponse } from "next/server";
import { liveSitemap } from "./lib/seo/sitemap-proxy.mjs";

export async function middleware(request) {
  if (process.env.VERCEL === "1") {
    const response = await liveSitemap(request, process.env.API_URL || process.env.NEXT_PUBLIC_API_URL);
    if (response) return response;
  }
  return NextResponse.next();
}

export const config = { matcher: ["/sitemap.xml", "/sitemap-auctions-:page(\\d+).xml"] };
