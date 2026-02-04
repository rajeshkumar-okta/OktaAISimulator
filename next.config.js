/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Vercel environment
  env: {
    VERCEL_ENV: process.env.VERCEL_ENV || 'development',
  },
  // Headers for static files
  async headers() {
    return [
      {
        source: '/public/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  // Rewrites for frontend routes
  async rewrites() {
    return {
      beforeFiles: [
        // API routes are handled by /pages/api
      ],
      fallback: [
        {
          source: '/:path*',
          destination: '/:path*',
        },
      ],
    };
  },
};

module.exports = nextConfig;
