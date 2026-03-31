import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.50.233"],
  reactStrictMode: false,
  turbopack: {},
};

export default withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      // Cache centroid GeoJSON files (static, never change between deploys)
      {
        urlPattern: /\/(state|county|city|major-city)-centroids\.geojson$/,
        handler: "CacheFirst",
        options: {
          cacheName: "geojson-centroids",
          expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
        },
      },
      // Cache Stadia map style JSON
      {
        urlPattern: /tiles\.stadiamaps\.com\/styles\//,
        handler: "StaleWhileRevalidate",
        options: { cacheName: "map-style" },
      },
      // Cache Stadia map tiles (raster/vector tiles)
      {
        urlPattern: /tiles\.stadiamaps\.com\/tiles\//,
        handler: "CacheFirst",
        options: {
          cacheName: "map-tiles",
          expiration: {
            maxEntries: 1000,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
          },
        },
      },
    ],
  },
})(nextConfig);
