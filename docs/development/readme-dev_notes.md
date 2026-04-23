# Dev Notes

Lessons learned and non-obvious decisions worth remembering.

---

## `pois` database view

`POIDetailPanel` (and any future client queries that need flat coordinates) uses
`.from("pois")` rather than `.from("points_of_interest")`. The `pois` view
exposes `lat` and `lng` by extracting them from the PostGIS `geom` column:

```sql
CREATE OR REPLACE VIEW pois AS
SELECT
  id, title, description, long_description, tags,
  ST_Y(geom::geometry) AS lat,
  ST_X(geom::geometry) AS lng,
  is_verified, legislation_url, attributes
FROM points_of_interest;
```

Migration: `supabase/migrations/20260423000003_pois_view.sql`

If you add columns to `points_of_interest` that client code needs, add them to
this view too.

---

## Centroid GeoJSON files — always fetch with `cache: "no-cache"`

`/state-centroids.geojson`, `/county-centroids.geojson`, and
`/city-centroids.geojson` are static files in `public/` with no content-hash
in their names. The browser's HTTP cache can serve stale versions after a
deployment that updates these files.

All fetches for these files in `useRegionColors.ts` use `{ cache: "no-cache" }`
so the browser always revalidates with the server:

```ts
const geo = await fetch("/city-centroids.geojson", { cache: "no-cache" }).then(r => r.json());
```

**Why this matters:** `useRegionColors` uses a `nearest()` centroid lookup to
map a POI's lat/lng to a feature ID (e.g. `PLACEFP`) for `setFeatureState`. If
the wrong (stale) centroid file is served, the wrong region gets colored. This
burned us with Provincetown — the stale file was missing its entry, so
`nearest()` fell back to Barnstable Town and colored the wrong polygon.

The service worker intentionally does **not** cache these files (see `public/sw.js`).

---

## CDP cities missing from PMTiles / centroid files (LSAD=57)

The TIGER/Line 500k place shapefile (`cb_YYYY_us_place_500k.shp`) excludes
Census Designated Places (LSAD=57). If a destination city is a CDP, it will not
appear in:

- `public/tiles/boundaries.pmtiles` (no polygon to color)
- `public/city-centroids.geojson` (no centroid for the `nearest()` lookup)

**Fix:** manually add the centroid entry to `city-centroids.geojson` and
rebuild PMTiles with the full TIGER file (`tl_YYYY_us_place.shp`) or the
GENZ 500k file with a relaxed LSAD filter.

Provincetown, MA (PLACEFP=55535, LSAD=57) was patched this way in April 2026.
Its centroid was added manually; PMTiles were rebuilt including its polygon.

---

## City-scoped POIs require `attributes.city_name` and `attributes.statefp`

The `pois_in_city` SQL function (called when a user clicks a city polygon)
matches POIs using `attributes->>'city_name'` and `attributes->>'statefp'`.
A city-scoped POI without these fields will never appear in the city's POI
panel, even if its geometry is correct.

When inserting a city-scoped POI (`effect_scope = 'city'`), always set:

```json
{
  "city_name": "Provincetown",
  "statefp": "25"
}
```

- `city_name` must match the Census `NAME` property exactly as it appears in
  the map tiles (check the city centroid GeoJSON or click the polygon and
  inspect the `name` in `selectedRegion`).
- `statefp` is the 2-digit Census FIPS state code (e.g. `"25"` for
  Massachusetts). See `STATEFP_TO_ABBR` in `src/hooks/useRegionPOIs.ts` for
  the full list.

This also applies to the `pois_in_city` call — if a city POI is visible on the
map as a dot but absent from the region panel, missing/wrong `attributes` is
the first thing to check.
