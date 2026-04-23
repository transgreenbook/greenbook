# Performance — Caching and Measurement

## What is cached and for how long

| Asset | Strategy | TTL |
|---|---|---|
| POI viewport data (Supabase RPC) | React Query in-memory | 4 hours |
| Region color data (state/county/city fills) | React Query in-memory | 4 hours |
| Next.js JS/CSS bundles (`/_next/static/`) | Service worker CacheFirst | Indefinite (content-hashed; new deploy = new URL) |
| Icons and images (`/icons/`, `.png/.svg`) | Service worker CacheFirst + HTTP header | SW: indefinite; HTTP: 7 days |
| GeoJSON centroid files (`/public/*.geojson`) | Service worker CacheFirst + HTTP header | SW: indefinite; HTTP: 24 hours (swr 7 days) |
| Map tiles (Stadia) | Service worker CacheFirst, max 2000 entries | Indefinite until evicted |
| Map style JSON (Stadia) | Service worker StaleWhileRevalidate | Served from cache; revalidated in background |

In production mode, Next.js also adds `Cache-Control: public, max-age=31536000, immutable` to all `/_next/static/` assets at the HTTP level, so bundles are cached by the browser for a year after first load.

---

## Switching from dev to production mode

The app currently runs with `npm run dev`. Production mode minifies React, tree-shakes unused code, and removes source maps — typically 3–5× smaller JS payload and noticeably faster rendering on older/slower devices.

**Build and start:**

```bash
# In the greenbook directory on the VM:
npm run build   # compile once (~1 min)
npm run start   # serve on port 3000
```

**Keep it running after closing the terminal (PM2):**

```bash
npm install -g pm2
pm2 start "npm run start" --name greenbook
pm2 save          # persist across VM reboots
```

To stop or restart:

```bash
pm2 stop greenbook
pm2 restart greenbook
pm2 logs greenbook   # view output
```

After a code change, rebuild and restart:

```bash
npm run build && pm2 restart greenbook
```

---

## Measuring performance

### Chrome DevTools (quickest)

1. Open the app in Chrome on the slow device (or simulate with throttling on the dev machine).
2. `F12` → **Network** tab → set throttle to **Fast 3G** or **Slow 3G** → hard-reload (`Ctrl+Shift+R`).
3. Watch the waterfall — the `/_next/static/chunks/` files are the main thing to compare between dev and production. In dev they'll be large and uncacheable; in production they'll be small, hashed, and served instantly from cache after the first load.
4. Check **total transfer size** at the bottom of the Network tab.

### Lighthouse (scored report)

1. `F12` → **Lighthouse** tab → select **Mobile** → click **Analyze page load**.
2. Key metrics: **LCP** (Largest Contentful Paint — time until the map appears) and **TTI** (Time to Interactive).
3. Lighthouse applies CPU and network throttling automatically, so it's a reasonable proxy for an older phone even when run on a fast machine.

### On an actual Android device

1. Enable **USB debugging** on the phone (Settings → Developer Options).
2. Connect via USB and open `chrome://inspect` in Chrome on your PC.
3. Click **Inspect** under the phone's tab — you get full DevTools running against the real device.

### On an actual iOS device

1. On the iPhone: **Settings → Safari → Advanced → Web Inspector → On**.
2. Connect via USB, open Safari on the Mac, **Develop menu → [device name]**.

---

## When to re-measure

- After switching from `npm run dev` to `npm run start` (production build).
- After any large change to the map component or data-fetching hooks.
- If a new slow-loading complaint comes up from a specific device or network.
