# Stack Reference

Current technology choices, data sources, and architecture. For running and
operating the app see [readme-services.md](readme-services.md). For upgrade
decision points see [readme-paidupgrades.md](readme-paidupgrades.md).

---

## At a Glance

```
Frontend        Next.js 16 + MapLibre GL JS + Zustand + TanStack Query + Tailwind 4
Database        Supabase (local Docker) — Postgres 16 + PostGIS + pg_trgm
Auth            Supabase Auth — admin-only, JWT
Tiles           Stadia Maps (base) + PMTiles local file (boundaries)
Geocoding       Stadia Maps / Photon / Nominatim (switchable via env var)
Routing         Valhalla (free OSM instance now → Stadia / self-hosted later)
Images          Cloudinary (free tier)
Analytics       PostHog Cloud (free tier)
News digest     Anthropic Claude API + Gmail SMTP
Legislation     OpenStates API
Hosting         Systemd service on local Ubuntu VM (not cloud-hosted yet)
```

---

## Frontend

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** | App Router; API routes for backend proxying |
| Map renderer | **MapLibre GL JS 5** | WebGL; open source; handles touch + gestures |
| State management | **Zustand 5** | Four stores: `mapStore`, `routeStore`, `filterStore`, `appStore` |
| Data fetching | **TanStack Query 5** | Cache + loading states for POIs, region data |
| Styling | **Tailwind CSS 4** | Utility-first; responsive desktop + mobile layouts |
| Tile protocol | **PMTiles** | Single-file tile archive via HTTP range requests |
| POI clustering | **Supercluster** | Groups POI markers at lower zoom levels |
| Offline shell | **Service Worker** (`ServiceWorkerRegistrar.tsx`) | Caches tiles; no full offline mode yet |

### Map Layer Stack (zoom-based)
```
Zoom 3–5:   State fills colored by dominant severity POI
Zoom 6–8:   County fills fade in, state fills fade out
Zoom 9–11:  City boundaries; POI markers begin appearing
Zoom 12+:   Individual POI icons, full street detail
```

### Layout
```
Desktop  (md+):  Full-screen map + collapsible right sidebar
Mobile:          Full-screen map + draggable bottom sheet
```

### Key Stores
| Store | Owns |
|---|---|
| `mapStore` | Selected region, selected POI, flyTo, map instance ref |
| `routeStore` | Start/end waypoints, route geometry, POIs along route, buffer |
| `filterStore` | Hidden category IDs, category list |
| `appStore` | Open panel (map/search/resources/federal/about), POI detail state |

---

## Database

**Supabase local** (Docker via Supabase CLI). 65 versioned migrations in
`supabase/migrations/`. Production deployment would be `supabase db push` to a
Supabase Cloud project.

### Key Tables

| Table | Purpose |
|---|---|
| `points_of_interest` | All map content — venues, laws, policies, restrooms |
| `categories` | POI types with color, icon, `map_visible`, `bulk_import` flags |
| `states` / `counties` / `cities` | Geographic hierarchy with PostGIS boundary geometry |
| `reservations` | Tribal nation boundaries |
| `profiles` | Auth users; `role` enum: `admin \| user` |
| `user_favorites` | Saved POIs per user (ready, not yet surfaced in UI) |
| `legislation_bills` | Tracked state bills via OpenStates |
| `watch_items` | Bills under active monitoring for the news digest |
| `digest_runs` / `digest_findings` | News digest run history and AI-extracted findings |

### Key POI Fields
```
is_verified   — data quality signal (admin has confirmed this is accurate)
is_visible    — map visibility (can be hidden without un-verifying)
effect_scope  — point | city | county | state | reservation
prominence    — neighborhood | local | regional | national (controls zoom threshold)
severity      — integer; negative = danger/warning, positive = affirming/safe
source        — import provenance (orbitz, refuge_restrooms, catpalm, etc.)
```

### Spatial Functions (RPCs)
| Function | Used by |
|---|---|
| `pois_in_viewport` | Map marker layer |
| `pois_in_state/county/city/reservation` | Region POI panel |
| `pois_along_route` | Route POI discovery |
| `get_region_scoped_pois` | State/county/city color fill layer |
| `poi_counts_by_category` | Admin lazy-load UI |
| `get_poi_for_edit` | Admin edit form |

### Row Level Security
- Public: `is_verified = true AND is_visible = true`
- Admins: full access (via `is_admin()` helper)

---

## Mapping & Tiles

| Concern | Current setup |
|---|---|
| Base tiles | **Stadia Maps** `alidade_smooth` style — free tier (200k req/mo) |
| Boundary tiles | **PMTiles** file served locally at `/tiles/boundaries.pmtiles` |
| Boundary source | US Census TIGER/Line — states, counties, cities |
| Reservation boundaries | BIA/TIGER tribal boundary data |

PMTiles is a single static file read via HTTP range requests — no tile server
needed. Built with Tippecanoe from Census GeoJSON.

---

## Geocoding & Routing

Provider is switchable via env var (`GEOCODING_PROVIDER`, `ROUTING_PROVIDER`).

### Geocoding
| Setting | Provider |
|---|---|
| `stadia` (current) | Stadia Maps geocoding — free tier |
| `photon` | Photon (OSM-based, no key required) |
| `nominatim` | Nominatim fallback |

### Routing
| Setting | Provider | Limit |
|---|---|---|
| `stadia` (configured) | Stadia Maps (Valhalla) | No distance limit on paid |
| *(actual current)* | `valhalla1.openstreetmap.de` | ~930 mile cap |

The routing code in `src/app/api/route/route.ts` currently calls the free OSM
Valhalla instance regardless of `ROUTING_PROVIDER`. Switching to Stadia requires
updating the endpoint URL. See [readme-paidupgrades.md](readme-paidupgrades.md)
for the migration plan including privacy considerations for safety routing.

**Planned routing features:**
- Lazy safety-route: second Valhalla call when route passes through high-severity
  regions, surfaced as an opt-in alternate route with mileage comparison
- Manual waypoints for user-directed route shaping
- `exclude_polygons` support for automatic region avoidance

---

## Admin Panel

Custom-built Next.js admin at `/admin`. No third-party admin framework.

| Section | What it does |
|---|---|
| `/admin/pois` | POI review queue; lazy-load by category; batch verify/hide/delete |
| `/admin/pois/[id]/edit` | Full POI edit form |
| `/admin/pois/new` | Create POI form |
| `/admin/categories` | Manage categories |
| `/admin/digest` | News digest run history and findings review |

### Bulk POI Editing (CSV)
Export the current filtered view as CSV → edit in Google Sheets / Excel →
re-import with conflict detection (`updated_at` comparison), skip/overwrite
per-row, and a post-import summary of skipped rows. See
[readme-poi-spreadsheet.md](readme-poi-spreadsheet.md) for column reference.

---

## POI Data Sources

All imports are idempotent scripts in `scripts/` keyed on `source_id`.

| Source | `source` value | Content |
|---|---|---|
| Orbitz 2019 "LGBTQ Hangouts" | `orbitz` | 39 curated venues, all 50 states |
| Orbitz 2021 "Oldest LGBTQIA Bars" | `orbitz` | 9 historic bars |
| Refuge Restrooms | `refuge_restrooms` | ~32k all-gender restroom locations |
| CATPALM (laws/policy) | `catpalm` | State-level trans policy data |
| KOA campgrounds | `koa-blog-2023` | LGBTQ-friendly campgrounds |
| Roadtrippers campgrounds | `roadtrippers` | LGBTQ-friendly campgrounds |
| RVshare campgrounds | `rvshare` | LGBTQ-friendly campgrounds |
| News Is Out 2023 | `newsisout-2023` | Philadelphia LGBTQ venues |
| Google Sheets sync | varies | Manual/collaborative POI additions |
| Manual admin entry | `manual` | One-off POIs via admin form |

---

## News Digest

Automated pipeline (`scripts/news-digest.mjs`, runs on-demand or via cron):

1. Fetch recent news about tracked legislation bills (OpenStates + web search)
2. Pass articles through Claude (Anthropic API) to extract findings
3. Store findings in `digest_findings` with confidence scores
4. Email summary via Gmail SMTP (nodemailer)
5. Admin review UI at `/admin/digest`

---

## Legislation Tracking

- **OpenStates API** — fetches bill status and text for tracked states
- Bills stored in `legislation_bills` with state, bill number, status, and links
- `watch_items` table tracks bills under active monitoring
- CATPALM import populates state/county-level law POIs with severity scores
- `enrich-catpalm-legislation-urls.mjs` cross-references CATPALM entries with
  OpenStates to attach direct bill links

---

## Authentication

- **Supabase Auth** — email/password, admin-only currently
- JWT session, validated server-side via `@supabase/ssr`
- `profiles` table with `role` enum — ready for public user accounts
- RLS policies enforce access at the DB level

---

## Images

- **Cloudinary** free tier (25 GB) — configured but not yet used heavily
- On-demand transforms via URL (thumbnail, card, full sizes)
- `IMAGE_PROVIDER=cloudinary` in `.env.local`

---

## Analytics

- **PostHog Cloud** free tier (1M events/mo) — configured and active
- Session recording, funnels, event tracking
- Self-hosted PostHog or Umami as upgrade path

---

## External Services Summary

| Service | Purpose | Cost | Limit |
|---|---|---|---|
| Supabase (local) | Database + Auth | Free | Local only |
| Stadia Maps | Base tiles + geocoding | Free tier | 200k tile req/mo |
| Valhalla (OSM public) | Routing | Free | ~930 mi/route |
| Cloudinary | Image storage | Free tier | 25 GB |
| PostHog Cloud | Analytics | Free tier | 1M events/mo |
| Anthropic Claude | News digest AI | **Paid** | Per token |
| OpenStates | Legislation data | Free tier | Rate limited |
| Gmail SMTP | Digest email | Free | 500 emails/day |
| Google Sheets API | POI sync | Free | — |

---

## Docs Index

| File | Contents |
|---|---|
| `readme-stack.md` | This file — tech choices and architecture |
| `readme-costs.md` | What we're paying for right now and what's on free tiers |
| `readme-services.md` | Running the app — systemd, migrations, backup, sync |
| `readme-paidupgrades.md` | When free tiers run out — upgrade decision points |
| `readme-startup.md` | First-time setup and reboot procedure |
| `readme-scripts.md` | All import/maintenance scripts and what they do |
| `readme-poi-spreadsheet.md` | CSV column reference for bulk POI editing |
| `readme-severity.md` | Severity scoring system and color mapping |
| `readme-visibility.md` | `is_verified` vs `is_visible` explained |
| `readme-routing.md` | Routing provider options and switchover instructions |
| `readme-icons.md` | POI icon system |
| `readme-performance.md` | Performance notes and query optimization |
| `readme-goingproduction.md` | Checklist for cloud deployment |
| `readme-files.md` | Root directory file reference |
| `progress.md` | Development log |
| `sources/` | Raw data and notes for POI import sources |
| `development/` | Development notes and scratch files |
