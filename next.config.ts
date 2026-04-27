import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.50.233"],
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  reactStrictMode: false,
  turbopack: {},

  async headers() {
    return [
      // GeoJSON centroid files — served from /public, change only on deploy.
      // 24-hour browser cache + 7-day stale-while-revalidate.
      {
        source: "/:file(.*\\.geojson)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      // Icons and images in /public/icons — change only on deploy.
      // 7-day browser cache.
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
