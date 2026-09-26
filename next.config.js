/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1";
const isDev = process.env.NODE_ENV === "development";
// Static export only for non-Vercel production builds (Windows / Cloudflare out/).
const useStaticExport = !isVercel && !isDev;

function apiUpstream() {
  const raw = (
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://91.149.133.54"
  )
    .trim()
    .replace(/\/$/, "");
  // Prefer hostname form for environments that block raw IPs; local Next is fine with IP.
  if (/^https?:\/\/\d{1,3}(?:\.\d{1,3}){3}$/i.test(raw)) {
    const ip = raw.replace(/^https?:\/\//i, "");
    return `http://${ip}`;
  }
  return raw || "http://91.149.133.54";
}

const nextConfig = {
  ...(useStaticExport ? { output: "export" } : {}),
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    // Local `next dev` + Vercel: same-origin /api → Windows FastAPI
    if (!isVercel && !isDev) return [];
    const upstream = apiUpstream();
    return [
      { source: "/api/:path*/", destination: `${upstream}/api/:path*` },
      { source: "/api/:path*", destination: `${upstream}/api/:path*` },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**.copart.com' },
      { protocol: 'https', hostname: 'cs.copart.co.uk' },
      { protocol: 'https', hostname: 'c-static.copart.com' },
      { protocol: 'https', hostname: 'images.bid.cars' },
      { protocol: 'https', hostname: 'mercury.bid.cars' },
      { protocol: 'https', hostname: '**.bid.cars' },
      { protocol: 'https', hostname: '**.pages.dev' },
      { protocol: 'https', hostname: '**.workers.dev' },
      { protocol: 'http', hostname: '91.149.133.54' },
      { protocol: 'http', hostname: '**.nip.io' },
    ],
  },
  // Avoid EMFILE on macOS: don't watch huge static/catalog dumps.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/out/**',
          '**/.wrangler/**',
          '**/public/catalog/**',
          '**/public/auctions/**',
          '**/*.json',
        ],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
