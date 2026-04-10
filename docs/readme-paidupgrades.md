# Paid Upgrade Decision Points

This document is an index of the services that have free-tier limits we are
likely to hit as usage grows. Each section links to the detailed notes already
in other readme files.

---

## Routing — ~932-mile distance limit (immediate blocker)

**Current:** Free public Valhalla instance (`valhalla1.openstreetmap.de`).
Hard cap at ~932 miles (1,500 km) per request. This is already blocking
cross-country routes on the US travel map.

**Recommended fix:** Switch to Stadia Maps routing (same Valhalla API, one URL
change, no distance limit on paid plans). See **[readme-routing.md](readme-routing.md)**
for the full options table and step-by-step Stadia switchover instructions.

**Cost:** Stadia Maps is usage-based. Check current pricing at stadiamaps.com.
Self-hosted Valhalla is an alternative with no per-request cost (~$20–40/mo VPS,
~50 GB disk for the US routing graph).

---

## Base Map Tiles — 200,000 requests/month free

**Current:** Stadia Maps `alidade_smooth` tiles, free tier.
Heavy usage or traffic spikes can exhaust the monthly quota.

**Options:** Upgrade to a paid Stadia Maps plan, or self-host tiles using
MapLibre + a PMTiles extract hosted on Cloudflare R2.

See the **Mapping & Tile Infrastructure** section of **[stack-summary.md](stack-summary.md)**
for the full architecture.

---

## Geocoding / Address Search — rate-limited on free tiers

**Current:** Photon (OSM-based, no key required) with Nominatim as fallback.
Both are rate-limited and not suitable for production traffic.

**Recommended fix:** Stadia Maps geocoding is included in the Stadia account and
removes the rate limit. See the **Geocoding** section of
**[stack-summary.md](stack-summary.md)** for the full provider comparison.

---

## Image Storage — 25 GB free on Cloudinary

**Current:** Cloudinary free tier (25 GB storage, on-demand transforms).
POI photos are not yet uploaded in volume; this limit is not immediately blocking.

**Options:** Stay on Cloudinary (paid tier), switch to ImageKit, or move to
Supabase Storage + sharp for manual resizes. See the **Image Storage** section
of **[stack-summary.md](stack-summary.md)**.

---

## Analytics — 1 million events/month free on PostHog

**Current:** PostHog Cloud free tier. Not blocking at current traffic.

**Options:** Self-hosted PostHog (same product, unlimited events, ~$20–40/mo
VPS) or Umami (simpler, near-zero cost). See the **Analytics** section of
**[stack-summary.md](stack-summary.md)**.

---

## Summary — what to upgrade first

| Priority | Service | Blocker today? | Recommended action |
|----------|---------|---------------|-------------------|
| **1** | Routing (Valhalla) | Yes — 932-mile cap | Switch to Stadia Maps routing |
| **2** | Geocoding | At scale | Switch to Stadia Maps geocoding |
| **3** | Base tiles | At scale | Upgrade Stadia plan or self-host |
| **4** | Image storage | Not yet | Stay on Cloudinary free tier |
| **5** | Analytics | Not yet | Stay on PostHog free tier |
