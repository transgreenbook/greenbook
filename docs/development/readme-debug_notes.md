# Debug Notes

Known gotchas and things to verify when working on specific features.

---

## Adding a new city-scoped POI

Whenever you create a POI with `effect_scope = 'city'`, verify that the city
appears correctly on the map before committing:

1. **Check the city colors on the map.** Pan to the city at zoom 10+. It should
   show a distinct fill color (green for positive severity, red-orange for
   negative). If it looks the same as the surrounding region, the `setFeatureState`
   call is silently failing.

2. **Check the PLACEFP in the console.** `useRegionColors` logs nothing by
   default, but if you add a temporary debug log you can confirm which PLACEFP
   was resolved. The PLACEFP should match the Census TIGER record for that city,
   not a neighboring municipality.

3. **Check whether the city is a CDP (LSAD=57).** The build script
   (`scripts/build-tiles.sh`) excludes Census Designated Places from
   `public/tiles/boundaries.pmtiles` and `public/city-centroids.geojson`.
   CDPs have no polygon to color and no centroid for the `nearest()` lookup,
   so `setFeatureState` will silently target the wrong feature.

   To check: look up the city in the Census TIGER 500k place file, or search
   `public/city-centroids.geojson` for the city name:

   ```bash
   python3 -c "
   import json
   data = json.load(open('public/city-centroids.geojson'))
   hits = [f for f in data['features'] if 'YourCity' in f['properties'].get('NAME','')]
   for h in hits: print(h['properties'])
   "
   ```

   If the city is missing, add its centroid manually to `city-centroids.geojson`
   and rebuild PMTiles. See the Provincetown fix (April 2026) as a reference —
   PLACEFP=55535, LSAD=57.

**Why this happens:** Provincetown, MA is classified as a CDP in the Census
500k shapefile. The TIGER 500k place file uses LSAD=57 for CDPs, which the
build script filters out to avoid cluttering the map with every unincorporated
community. Most well-known LGBTQ+ destination cities are incorporated
municipalities and will be fine, but resort towns and unincorporated communities
can be CDPs.
