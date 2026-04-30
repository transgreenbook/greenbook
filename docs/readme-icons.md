# Map Icons

## Icon Sources

Free use:
- https://uxwing.com/transgender-symbol-icon/
- https://www.svgrepo.com/svg/116383/martini-glass-with-straw

---

## Adding a New POI Icon

Icons are SVG files served as static assets and loaded at map startup via
`useMapLayers.ts`. Each icon is registered under a name (e.g. `"poi-nightlife"`)
that matches the `icon` column on `points_of_interest` rows.

### Steps

1. **Place the SVG in `public/icons/`**

2. **Register the icon in `src/hooks/useMapLayers.ts`** — add a line to `POI_ICONS`:
   ```ts
   { name: "poi-nightlife", url: `${basePath}/icons/martini-glass-with-straw.svg`, fill: "#9333ea" },
   ```
   `fill` is injected into the SVG at load time, so the icon renders in that color on the map.

3. **Register the icon in `src/components/RegionPOIPanel.tsx`** — add a matching
   entry to `POI_ICON_MAP` so the icon also appears in the sidebar list:
   ```ts
   "poi-nightlife": { url: `${basePath}/icons/martini-glass-with-straw.svg`, fill: "#9333ea" },
   ```

4. **Set the icon on POIs in the database** — update the `icon` column on the
   relevant `points_of_interest` rows. To apply to all POIs in a category:
   ```sql
   UPDATE points_of_interest
   SET icon = 'poi-nightlife'
   WHERE category_id = 7;  -- 7 = Nightlife
   ```

### Current icons

| Name | File | Category |
|------|------|----------|
| `poi-restroom` | `transgender-symbol.svg` | Restrooms / gender-neutral |
| `poi-nightlife` | `martini-glass-with-straw.svg` | Nightlife (category 7) |

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
