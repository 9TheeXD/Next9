import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // TODO(security): Review and tighten permissions as features are added
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'`,
            // TODO(security): Remove 'unsafe-eval' and 'unsafe-inline' once Next.js nonce support is configured
          },
        ],
      },
      {
        // CORS headers for API routes consumed by mobile app
        source: "/api/(.*)",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            // TODO(security): Replace with actual mobile app origin in production
            value: process.env.CORS_ORIGIN || "http://localhost:8081",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
