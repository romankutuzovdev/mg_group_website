/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // Keep /api/* without forced trailing slash so Vercel rewrites hit Windows API
  // (otherwise /api/... → /api/.../ → static HTML 404 and Telegram login breaks).
  skipTrailingSlashRedirect: true,
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