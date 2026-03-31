# Map Icons

## POI Category Icons

The `categories` table already has an `icon_slug` field designed for this.

### Steps

1. **Choose an icon set** — [Maki](https://labs.mapbox.com/maki-icons/) is recommended.
   It is free, open source, and designed specifically for maps. It covers parks,
   restaurants, hotels, gas stations, hospitals, and many more.

2. **Add icons to the map** — At map startup, load each icon image:
   ```ts
   map.loadImage('/icons/poi/park.png', (err, image) => {
     if (!image) return;
     map.addImage('park', image);
   });
   ```
   A good place to do this is in `src/hooks/useMapLayers.ts` after the style loads.

3. **Store the slug in categories** — The `icon_slug` column in the `categories`
   table should match the image name registered with `map.addImage` (e.g. `"park"`).

4. **Include `icon_slug` in the GeoJSON** — Update `pois_in_viewport` to JOIN
   categories and return `icon_slug` alongside `color`, then pass it through
   in `usePOIs.ts`.

5. **Switch `pois-unclustered` to a symbol layer** — In `src/lib/mapLayers.ts`,
   change the layer type from `circle` to `symbol` and use a `match` expression:
   ```ts
   {
     id: "pois-unclustered",
     type: "symbol",
     source: "pois",
     filter: ["!", ["has", "point_count"]],
     layout: {
       "icon-image": [
         "match", ["get", "icon_slug"],
         "park",       "park",
         "restaurant", "restaurant",
         "hotel",      "lodging",
         /* fallback */ "marker",
       ],
       "icon-size": 1,
       "icon-allow-overlap": true,
     },
   }
   ```

6. **Provide a fallback** — Always register a generic `"marker"` image so POIs
   without a matching icon still render.

---

## State / County / City Attribute Icons

These would show contextual information at the region level — local laws,
attractions, hazards, etc.

### Data model

Create a `region_attributes` table:

```sql
CREATE TABLE region_attributes (
  id         SERIAL PRIMARY KEY,
  state_id   INT REFERENCES states(id),
  county_id  INT REFERENCES counties(id),
  slug       TEXT NOT NULL,   -- maps to an icon image name
  label      TEXT,            -- tooltip / legend text
  zoom_min   INT DEFAULT 4,   -- first zoom level where icon appears
  zoom_max   INT DEFAULT 10
);
```

A row with only `state_id` set is a state-level attribute; a row with
`county_id` set is county-level.

### Rendering

1. Fetch attributes via an RPC that returns them with the centroid lat/lng
   of the associated state or county.
2. Load the attribute icons into the map the same way as POI icons.
3. Add a symbol layer that reads from the attribute GeoJSON source and uses
   `icon-image: ["get", "slug"]` to pick the icon.
4. Use `minzoom` / `maxzoom` on the layer (or opacity interpolation) to show
   state-level icons at low zoom and county-level icons as you zoom in.

### Example slugs to consider

| Slug | Meaning |
|------|---------|
| `cannabis_legal` | Recreational cannabis is legal |
| `speed_camera` | Speed cameras in use |
| `sanctuary_city` | Sanctuary city/county |
| `state_park` | Notable state park nearby |
| `toll_road` | Toll roads present |
| `open_carry` | Open carry permitted |
