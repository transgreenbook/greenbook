Plan:  See stack-summary.md

First - Create virtual machine, install Ubuntu Server 24.04.4

First round of installation:
  Project structure:

  greenbook/
  ├── src/app/          — Next.js App Router pages
  ├── supabase/         — migrations + local config (supabase init)
  ├── docker-compose.yml — local Postgres/PostGIS 16
  ├── .env.local        — all env vars pre-stubbed
  └── node_modules/     — all deps installed      

  Dependencies installed:                                                                                                                                                                                                                         
  - maplibre-gl — map renderer                
  - zustand — state management                
  - @tanstack/react-query — data fetching
  - supercluster — POI clustering        
  - @supabase/supabase-js + @supabase/ssr — auth + DB client
  - idb — IndexedDB for offline POI storage                 
  - tailwindcss — styling (via Next.js scaffold)

Second phase - everything is up and running:             

  ┌─────────────────┬─────────────────────────────────────────────────────────┐
  │     Service     │                           URL                           │
  ├─────────────────┼─────────────────────────────────────────────────────────┤
  │ Supabase API    │ http://127.0.0.1:54321                                  │
  ├─────────────────┼─────────────────────────────────────────────────────────┤
  │ Supabase Studio │ http://127.0.0.1:54323                                  │
  ├─────────────────┼─────────────────────────────────────────────────────────┤
  │ Database (psql) │ postgresql://postgres:postgres@127.0.0.1:54322/postgres │
  └─────────────────┴─────────────────────────────────────────────────────────┘
   
  Schema applied — all 9 tables are live: states, counties, cities, categories, points_of_interest, poi_images, poi_links, profiles, user_favorites — with PostGIS, pg_trgm, spatial indexes, FTS, RLS policies, and the updated_at trigger.

  .env.local is filled in with the local anon key.

Third phase - here's what was created:

  - src/components/Map.tsx — MapLibre map, initializes on mount, adds navigation/geolocate/scale controls. Uses the Stadia alidade_smooth style when NEXT_PUBLIC_STADIA_API_KEY is set, falls back to MapLibre's demo tiles otherwise so it works 
  immediately.
  - src/components/MapLoader.tsx — thin client wrapper that holds the ssr: false dynamic import (required by Next.js App Router rules).
  - src/app/page.tsx — full-height layout: 48px header + map filling the rest.

  To run the dev server: npm run dev — the map will be live at http://localhost:3000. Without a Stadia key yet it'll render on the free demo tiles. Once you add NEXT_PUBLIC_STADIA_API_KEY to .env.local it'll switch to the smooth OSM style automatically.

Fourth phase - Clean build. Here's what was added:

  - src/lib/supabase.ts — browser Supabase client singleton. Import supabase anywhere in a Client Component or hook to query the DB or call auth.
  - src/components/Providers.tsx — wraps the app in QueryClientProvider with a 1-minute default stale time.
  - src/app/layout.tsx — updated to wrap all children with <Providers>.

  To use them together, a query hook will look like this:

  // src/hooks/usePOIs.ts
  import { useQuery } from "@tanstack/react-query";
  import { supabase } from "@/lib/supabase";
  export function usePOIs(bounds){
    return useQuery({
      queryKey: ["pois", bounds],
      queryFn: () => supabase.from("points_of_interest").select("*")...
    });
  }

Fifth phase:
Viewport-bounded POI query (1ac2929)
  - A Postgres RPC function pois_in_viewport() using PostGIS ST_Within — queries only the POIs visible on screen, up to 500 at a time
  - src/hooks/usePOIs.ts — TanStack Query hook that calls the RPC and returns a GeoJSON FeatureCollection
  - src/hooks/useMapPOIs.ts — listens to map pan/zoom events and pushes fresh POI data into the MapLibre pois source automatically

Here's the full data flow:

  Map pans/zooms
      ↓ moveend event
  useMapPOIs captures bounds
      ↓
  usePOIs calls supabase.rpc("pois_in_viewport", bounds)
      ↓ PostGIS ST_Within query
  Returns rows → converted to GeoJSON FeatureCollection
      ↓
  source.setData() updates MapLibre "pois" source
      ↓
  Cluster circles + individual icons render automatically

  The system is fully wired — add any row to points_of_interest with is_verified = true and it will appear on the map at the right zoom level.

Sixth phase:
Census TIGER → PMTiles boundary tiles (381118a)
  - scripts/build-tiles.sh — downloads official US Census shapefiles for all 50 states and 3,000+ counties, converts them with ogr2ogr, and builds a single boundaries.pmtiles file using Tippecanoe
  - The 53MB PMTiles file is now being served locally from public/tiles/
  - Map.tsx registers the pmtiles:// protocol so MapLibre can read it
  - mapLayers.ts updated to use the real vector tile source instead of empty GeoJSON placeholders

Hard refresh http://192.168.50.233:3000 — you should now see US state outlines and fills rendered directly from the PMTiles file. As you zoom in past level 6, the state fills will fade out and county boundaries will fade in.

  The pipeline for production is ready too: upload tiles/boundaries.pmtiles to Cloudflare R2 and update NEXT_PUBLIC_PMTILES_URL to the R2 URL.

Seventh phase:
Hard refresh the browser. You should see:
  - Blue dot clusters across the US at the initial zoom
  - Clicking a cluster zooms in and expands it
  - Clicking an individual dot (zoom in past level 12) opens a panel on the right with the POI's title, description, coordinates, and the test-data tag
  - Clicking × closes the panel

