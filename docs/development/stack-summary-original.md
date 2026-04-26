# Interactive US Travel Map — Full Stack Summary

## Project Overview

A Google Maps-style interactive map of the United States with:
- Smooth zoom/pan from national level down to street level
- State, county, and city-level colorization and annotation
- Clickable POI icons linked to a travel/interest database
- Geocoding, address search, and route-based POI discovery
- Secure admin panel for managing all content
- Responsive design for desktop and mobile web
- App-ready architecture for future React Native migration
- Offline support via MapLibre tile caching and PWA

---

## Frontend

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js** | Web frontend + API routes in one project |
| Map renderer | **MapLibre GL JS** | WebGL, open source, built-in touch/gesture support |
| State management | **Zustand** | Lightweight, works in React and React Native |
| Data fetching | **TanStack Query** | Caching, loading states, portable to React Native |
| Styling | **Tailwind CSS** | Responsive design, swap for NativeWind if going mobile |
| PWA | **next-pwa** | Add early; enables offline and home screen install |

### Map Layer Stack (zoom-based)
```
Zoom 3–5:   State fills + labels
Zoom 6–8:   County fills fade in, state fills fade out
Zoom 9–11:  POI clusters appear, city boundaries
Zoom 12+:   Individual POI icons, full street detail
```

### Responsive Layout
```
Desktop  (>1024px):  Full-screen map + collapsible sidebar
Tablet   (768–1024): Full-screen map + bottom sheet
Mobile   (<768px):   Full-screen map + bottom sheet, 44px touch targets
```

---

## Mapping & Tile Infrastructure

| Concern | Choice | Notes |
|---|---|---|
| Base tiles | **Stadia Maps** | OSM data, alidade_smooth style, free up to 200k req/mo |
| Boundary tiles | **PMTiles on Cloudflare R2** | Single static file, HTTP range requests, ~$0.01/GB/mo |
| Tile format tool | **Tippecanoe** | CLI tool: converts US Census TIGER GeoJSON → PMTiles |
| Boundary data | **US Census TIGER/Line** | Free, authoritative state/county/city boundaries |
| Clustering | **Supercluster** | Built into MapLibre; groups POI icons at lower zoom levels |
| Offline tiles | **MapLibre tile cache + Service Worker** | Auto-caches viewed tiles; pre-packaged regional PMTiles for intentional download |

### PMTiles Build Pipeline
```
US Census TIGER GeoJSON files
        ↓
  tippecanoe (CLI)
        ↓
  boundaries.pmtiles
        ↓
  Upload to Cloudflare R2
        ↓
  MapLibre reads via HTTP range requests
```

### Offline Regional Tile Extracts
```
downloads/
  northeast.pmtiles
  southeast.pmtiles
  midwest.pmtiles
  southwest.pmtiles
  northwest.pmtiles
  alaska-hawaii.pmtiles
```

---

## Geocoding & Routing

All geocoding and routing calls are wrapped in a thin service layer with provider switchable via environment variable.

### Geocoding (Address → Coordinates + Autocomplete)

| Role | Provider | Notes |
|---|---|---|
| Primary | **Stadia Maps** | Included in existing relationship |
| Fallback | **Photon** | Free, OSM-based, has autocomplete |
| Emergency | **Nominatim** | Free, no autocomplete, rate limited |
| Nuclear | **Self-hosted Pelias** | Unlimited, VPS cost only |

### Routing (A → B + Route-based POI discovery)

| Role | Provider | Notes |
|---|---|---|
| Primary | **Stadia Maps (Valhalla)** | Included in existing relationship |
| Fallback | **OpenRouteService** | Free up to 2,000 req/day, multiple modes |
| Emergency | **OSRM public API** | Free, driving only, very reliable |
| Nuclear | **Self-hosted Valhalla** | Unlimited, VPS cost only |

### Route-based POI Query (PostGIS)
```sql
SELECT poi.*
FROM points_of_interest poi
WHERE ST_DWithin(
  poi.geom::geography,
  ST_GeomFromGeoJSON(:route_geometry)::geography,
  40233  -- 25 miles in meters
)
ORDER BY ST_Distance(
  poi.geom::geography,
  ST_GeomFromGeoJSON(:route_geometry)::geography
);
```

### Abstraction Pattern
```javascript
// lib/geocoding.js
export const geocodingService = providers[process.env.GEOCODING_PROVIDER || 'stadia'];

// lib/routing.js
export const routingService = providers[process.env.ROUTING_PROVIDER || 'stadia'];
```

---

## Backend & API

| Concern | Choice | Notes |
|---|---|---|
| API layer | **Next.js API Routes** | Stateless REST endpoints, consumed by web and future app |
| Auth middleware | **Supabase Auth** | JWT validation on all protected routes |

### API Design Principles
- Stateless — no server-side session, JWT only
- Viewport-bounded POI queries — never load all POIs at once
- Auth-aware on every route even where not required yet

### Viewport-bounded POI Query
```sql
SELECT * FROM points_of_interest
WHERE ST_Within(
  geom,
  ST_MakeEnvelope(:west, :south, :east, :north, 4326)
)
LIMIT 500;
```

---

## Database

| Concern | Choice | Notes |
|---|---|---|
| Database | **Supabase (Postgres 16)** | Hosted, free tier generous |
| Geo extension | **PostGIS** | Spatial queries, geometry storage |
| Search extension | **pg_trgm** | Fuzzy/typo-tolerant search, free |
| Full-text search | **Postgres FTS (tsvector)** | Built in, free, good for POI content search |
| Migrations | **Supabase CLI** | Versioned migration files from day one |

### Core Schema
```sql
-- Geographic hierarchy
states (
  id, name, abbreviation, fill_color, label, notes,
  geom GEOMETRY
)

counties (
  id, name, state_id, fips_code, fill_color,
  geom GEOMETRY
)

cities (
  id, name, county_id, state_id, population,
  geom GEOMETRY
)

-- POI content
categories (
  id, name, icon_slug, color
)

points_of_interest (
  id, title, description, long_description,
  website_url, phone,
  hours JSONB,               -- flexible per POI type
  attributes JSONB,          -- price, admission, etc.
  tags TEXT[],               -- Postgres native array
  category_id, state_id, county_id,
  geom GEOMETRY(Point, 4326),
  is_verified BOOLEAN DEFAULT false,
  is_user_submitted BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),  -- null for now, ready for user accounts
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title,'') || ' ' ||
      coalesce(description,'')
    )
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)

poi_images (
  id, poi_id, url, caption, is_primary, sort_order
)

poi_links (
  id, poi_id, label, url,
  link_type TEXT  -- website | booking | social | etc.
)

-- Future user accounts (tables created now, used later)
profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role user_role DEFAULT 'user',   -- enum: admin | user | moderator
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)

user_favorites (
  id, user_id, poi_id, created_at,
  UNIQUE(user_id, poi_id)
)
```

### Spatial Indexes (required for performance)
```sql
CREATE INDEX idx_poi_geom      ON points_of_interest USING GIST(geom);
CREATE INDEX idx_poi_search    ON points_of_interest USING GIN(search_vector);
CREATE INDEX idx_poi_trgm      ON points_of_interest USING GIN(title gin_trgm_ops);
CREATE INDEX idx_county_geom   ON counties           USING GIST(geom);
CREATE INDEX idx_state_geom    ON states             USING GIST(geom);
```

### Row Level Security Policies
```sql
-- Public reads verified POIs
CREATE POLICY "public_read_verified_pois"
ON points_of_interest FOR SELECT
USING (is_verified = true);

-- Admins have full access
CREATE POLICY "admins_full_access"
ON points_of_interest FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Future: user manages own submissions
-- CREATE POLICY "users_manage_own_submissions"
-- ON points_of_interest FOR ALL
-- USING (created_by = auth.uid());
```

---

## Authentication

| Concern | Choice | Notes |
|---|---|---|
| Auth provider | **Supabase Auth** | Admin-only now, multi-role ready |
| User roles | `admin \| user \| moderator` enum | Only admin used initially |
| Session | JWT via Supabase | Stateless, works on web and future app |

### Auth Context (three states from day one)
```javascript
// Even though only admin exists today, structure supports all states
const AuthContext = {
  user: null,        // anonymous (everyone today)
  user: adminUser,   // admin logged in
  user: publicUser,  // future public user
}

// Check capabilities, not roles
const canSubmitPOI  = user?.role === 'user'  || user?.role === 'admin';
const canManageAll  = user?.role === 'admin';
```

---

## Admin Panel

| Concern | Choice | Notes |
|---|---|---|
| Admin UI | **React Admin** or **Refine** | Auto-generates CRUD from API schema |
| Access | Supabase Auth + RLS | Admin role required |
| Capabilities | Manage states, counties, POIs, icons, categories, users |

---

## Search

| Type | Solution | Notes |
|---|---|---|
| POI content search | **Postgres FTS + pg_trgm** | Free, built in, handles stemming + fuzzy match |
| Address search | **Geocoding service** (Stadia primary) | See Geocoding section |
| Route discovery | **Routing service + PostGIS buffer** | See Routing section |

### Search Input Modes
```
User types address     → Geocoding API → fly to location → spatial POI query
User types free text   → Postgres FTS + pg_trgm → highlight matching POIs
User selects two addresses → Geocoding × 2 → routing → ST_DWithin buffer query
```

---

## Image Storage

| Concern | Choice | Notes |
|---|---|---|
| POI photos | **Cloudinary** | On-demand transforms via URL, 25GB free tier |
| Map icons | **SVGs in codebase or Cloudflare R2** | No transform needed, scale perfectly |
| Fallback | **ImageKit** | Similar feature set, 20GB bandwidth free |
| Nuclear | **Supabase Storage + sharp** | No CDN cost, manual resize on upload |

### Image Transform Pattern
```javascript
// Store once, request any size via URL
const thumbUrl = cloudinary.url(poiId, { width: 50,  height: 50,  crop: 'fill' });
const cardUrl  = cloudinary.url(poiId, { width: 400, height: 300, crop: 'fill' });
const fullUrl  = cloudinary.url(poiId, { width: 1200, height: 900, crop: 'fill' });
```

### Abstraction
```javascript
// lib/imageStorage.js
export const imageStorage = providers[process.env.IMAGE_PROVIDER || 'cloudinary'];
```

---

## Analytics

| Role | Choice | Notes |
|---|---|---|
| Primary | **PostHog Cloud** | Free up to 1M events/mo, session recording, funnels |
| Fallback | **Self-hosted PostHog** | Same product, unlimited events, ~$20–40/mo VPS |
| Nuclear | **Umami self-hosted** | Simpler, near-zero cost, good for basic traffic only |

### Switching is a one-line env change
```bash
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com         # cloud
NEXT_PUBLIC_POSTHOG_HOST=https://analytics.yoursite.com  # self-hosted
```

---

## Offline Support

| Concern | Solution |
|---|---|
| Tile caching | MapLibre automatic + Service Worker intercept |
| Intentional download | Pre-packaged regional PMTiles extracts |
| POI data offline | IndexedDB (via `idb` library) synced on region download |
| Connectivity detection | `navigator.onLine` + online/offline events |
| PWA shell | `next-pwa` package |

### Build Order
```
v1: Online only — get core experience right
v2: next-pwa manifest + automatic tile caching
v3: Regional download + IndexedDB POI sync
```

### What Works Offline
```
✅ Map browsing (cached/downloaded areas)
✅ POI icons and details (downloaded regions)
⚠️ POI photos (only if previously cached)
❌ Search, geocoding, routing (require connection)
```

---

## Hosting & Deployment

| Concern | Choice | Notes |
|---|---|---|
| Frontend + API | **Vercel** | Free tier, auto-deploy on git push, perfect for Next.js |
| Database | **Supabase cloud** | Free tier, managed Postgres + PostGIS |
| Boundary tiles | **Cloudflare R2** | ~$0.01/GB/mo, free egress |
| Images | **Cloudinary** | Free tier 25GB |
| Analytics | **PostHog Cloud** | Free up to 1M events |
| VPS path | **DigitalOcean + Coolify** | When self-hosting needed |

---

## Development Environment

| Concern | Choice | Notes |
|---|---|---|
| Local VM | **WSL2** (Windows) or **OrbStack** (Mac) | Best performance, Linux environment |
| Local services | **Docker Compose** | Postgres/PostGIS + Meilisearch in containers |
| Local Supabase | **Supabase CLI** | Full local Supabase stack via Docker |
| Schema management | **Supabase migrations** | Versioned SQL files from day one |
| Environment config | `.env.local` → `.env.production` | Never hardcode environment-specific values |

### Docker Compose (local services)
```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: travelapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Go-Live Checklist
```
1. Connect GitHub repo to Vercel → set prod env vars → auto-deploy
2. Create prod Supabase project → supabase db push (applies all migrations)
3. Upload PMTiles to Cloudflare R2 → update R2 URL in env vars
4. Update Cloudinary to prod credentials
5. Add prod domain to Stadia Maps API key allowlist
6. Set PostHog prod key
```

---

## Future App Path (React Native / Expo)

The web app is structured to minimize the React Native migration cost:

| Web | Mobile equivalent |
|---|---|
| Next.js pages | Expo Router |
| MapLibre GL JS | maplibre-react-native |
| Tailwind CSS | NativeWind |
| next-pwa | Native offline (built into Expo) |
| Supabase JS client | Same package, no change |
| TanStack Query | Same package, no change |
| Zustand | Same package, no change |
| Custom hooks | Fully reusable, no change |
| Next.js API routes | Fully reusable, no change |

### Habits That Keep App Path Open
- API routes are stateless REST — no browser assumptions
- Business logic lives in custom hooks, not page components
- Next.js-specific APIs (`next/image`, `next/router`) stay in the UI layer only
- Auth context has three states (anonymous, admin, user) from day one

---

## Complete Stack at a Glance

```
FRONTEND
  Next.js               — framework
  MapLibre GL JS        — map renderer
  Zustand               — state management
  TanStack Query        — data fetching
  Tailwind CSS          — styling
  next-pwa              — PWA + offline shell
  Supercluster          — POI clustering

MAPPING
  Stadia Maps           — base tiles (OSM, alidade_smooth)
  PMTiles + Cloudflare R2 — boundary tiles
  Tippecanoe            — GeoJSON → PMTiles build tool
  US Census TIGER       — boundary source data

GEOCODING & ROUTING
  Stadia Maps           — primary (geocoding + Valhalla routing)
  Photon / OpenRouteService — fallbacks
  Nominatim / OSRM      — emergency fallbacks
  Self-hosted options   — nuclear fallback (Pelias + Valhalla)

BACKEND
  Next.js API Routes    — stateless REST API
  Supabase Auth         — JWT authentication

DATABASE
  Supabase Postgres 16  — primary database
  PostGIS               — spatial queries + geometry storage
  pg_trgm               — fuzzy search
  Postgres FTS          — full-text search

ADMIN
  React Admin / Refine  — CRUD admin panel

IMAGES
  Cloudinary            — POI photos with on-demand transforms
  Cloudflare R2         — SVG icons + PMTiles
  ImageKit              — image fallback

ANALYTICS
  PostHog Cloud         — events, sessions, funnels (1M/mo free)

OFFLINE
  MapLibre cache        — automatic tile caching
  Service Worker        — intercept + cache tile requests
  IndexedDB (idb)       — POI data for downloaded regions
  Regional PMTiles      — pre-packaged area downloads

HOSTING
  Vercel                — Next.js frontend + API
  Supabase Cloud        — managed Postgres
  Cloudflare R2         — static tile + asset storage
  DigitalOcean + Coolify — VPS path when needed

DEV ENVIRONMENT
  WSL2 / OrbStack       — local Linux VM
  Docker Compose        — local Postgres/PostGIS
  Supabase CLI          — local Supabase + migrations
```

---

*Generated from design session — March 2026*
