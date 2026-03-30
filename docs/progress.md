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
  