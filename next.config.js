/** @type {import('next').NextConfig} */
const backendPort = process.env.BOT_PORT || '3001';
const backendUrl = process.env.BACKEND_URL || `http://localhost:${backendPort}`;
const uploadMaxMb = Math.max(1, Number.parseInt(process.env.UPLOAD_MAX_MB || '50', 10));

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    proxyClientMaxBodySize: `${uploadMaxMb}mb`
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`
      },
      {
        source: '/api-docs',
        destination: `${backendUrl}/api-docs`
      },
      {
        source: '/api-docs.json',
        destination: `${backendUrl}/api-docs.json`
      }
    ];
  }
};

module.exports = nextConfig;
