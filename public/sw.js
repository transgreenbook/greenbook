// Greenbook Service Worker
// Caches the app shell, static centroid GeoJSONs, Stadia map tiles/style,
// Next.js static bundles, and public assets (icons, images).

const SHELL_CACHE  = "greenbook-shell-v2";
const STATIC_CACHE = "greenbook-static-v2"; // Next.js bundles + public assets
const GEOJSON_CACHE = "greenbook-geojson-v3";
const TILE_CACHE   = "greenbook-tiles-v2";
const MAX_TILE_ENTRIES = 2000;

// App shell assets to precache on install
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Static GeoJSON files served from /public
const GEOJSON_ASSETS = [
  "/state-centroids.geojson",
  "/county-centroids.geojson",
  "/city-centroids.geojson",
  "/major-city-centroids.geojson",
];

// ── Install: precache shell + GeoJSONs ────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)),
      caches.open(GEOJSON_CACHE).then((c) => c.addAll(GEOJSON_ASSETS)),
    ]).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  const validCaches = [SHELL_CACHE, STATIC_CACHE, GEOJSON_CACHE, TILE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !validCaches.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: route requests to appropriate strategy ─────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Next.js static bundles — CacheFirst (filenames are content-hashed; new
  // deploys produce new URLs automatically, so stale entries are never served)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Public icons and images — CacheFirst (change only on redeploy)
  if (url.pathname.startsWith("/icons/") || url.pathname.match(/\.(png|svg|webp|ico)$/)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // GeoJSON centroids — CacheFirst (change only on redeploy)
  if (url.pathname.match(/\/(state|county|city|major-city)-centroids\.geojson$/)) {
    event.respondWith(cacheFirst(request, GEOJSON_CACHE));
    return;
  }

  // Stadia map style JSON — StaleWhileRevalidate
  if (url.hostname === "tiles.stadiamaps.com" && url.pathname.includes("/styles/")) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE));
    return;
  }

  // Stadia map tiles — CacheFirst with entry limit
  if (url.hostname === "tiles.stadiamaps.com" && url.pathname.includes("/tiles/")) {
    event.respondWith(cacheFirstWithLimit(request, TILE_CACHE, MAX_TILE_ENTRIES));
    return;
  }

  // App shell (navigation requests) — NetworkFirst with shell fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Everything else — network only
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  return cached ?? fetchPromise;
}

async function cacheFirstWithLimit(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (!response.ok) return response;

  cache.put(request, response.clone());

  // Trim oldest entries if over the limit
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await cache.delete(keys[0]);
  }

  return response;
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? caches.match("/");
  }
}
