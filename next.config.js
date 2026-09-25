/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1";

const nextConfig = {
  // Windows/Cloudflare static export. On Vercel use Next runtime so /api rewrites work
  // (trailingSlash + static out/ was 308→/api/.../ → HTML 404, empty catalog).
  ...(isVercel ? {} : { output: "export" }),
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    if (!isVercel) return [];
    const upstream = "http://91.149.133.54.nip.io";
    return [
      { source: "/api/:path*/", destination: `${upstream}/api/:path*` },
      { source: "/api/:path*", destination: `${upstream}/api/:path*` },
      { source: "/auctions/:slug/", destination: `${upstream}/auctions/:slug/` },
      { source: "/auctions/:slug", destination: `${upstream}/auctions/:slug/` },
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