# POI Spreadsheet Reference

This document describes the columns in the **POIs** tab of the Google Sheet used to manage points of interest. Changes are synced to the database by running `npm run sync-pois`.

---

## Column reference

| Column | Required | Format / valid values | Notes |
|---|---|---|---|
| `poi_id` | Auto | Integer | Written back by the sync script after a new row is inserted. **Leave blank for new POIs.** Do not edit this value. |
| `title` | Yes | Text | Display name of the POI. Rows without a title are skipped. |
| `description` | No | Text | Short description shown in the map pop-up. |
| `long_description` | No | Text | Full detail text shown in the POI detail panel. |
| `lat` | Yes | Decimal degrees | Latitude, e.g. `39.7392`. Rows without valid lat/lng are skipped. |
| `lng` | Yes | Decimal degrees | Longitude, e.g. `-104.9903`. Negative for western hemisphere. |
| `category` | No | Text | Must exactly match a category name in the database (case-insensitive). Leave blank to leave the POI uncategorised. |
| `tags` | No | Comma-separated text | e.g. `food, outdoor, family`. Used for filtering. |
| `is_verified` | No | `TRUE` or `FALSE` | Controls public visibility. Only `TRUE` POIs appear on the map. Defaults to `FALSE` if blank. |
| `website_url` | No | URL | e.g. `https://example.com` |
| `phone` | No | Text | Phone number in any format, e.g. `(303) 555-0100` |
| `icon` | No | Icon slug | Overrides the category icon. Leave blank to use the category default. |
| `color` | No | Hex color | e.g. `#e11d48`. Overrides the category color on the map dot. Leave blank to use the category default. |
| `effect_scope` | No | `point` `city` `county` `state` | Describes the geographic scope of the POI's relevance. Defaults to `point`. Currently used for data organisation; map display always uses the lat/lng point. |
| `prominence` | No | `neighborhood` `local` `regional` `national` | Controls at what zoom level the POI appears on the map (see table below). Defaults to `local`. |
| `severity` | No | Integer `-10` to `10` | Positive = good/recommended, negative = caution/warning. Defaults to `0`. |
| `visible_start` | No | ISO date `YYYY-MM-DD` | POI is hidden before this date. Leave blank to always show. |
| `visible_end` | No | ISO date `YYYY-MM-DD` | POI is hidden on and after this date. Leave blank for no expiry. |

---

## Prominence levels

Prominence controls when a POI becomes visible as the user zooms in.

| Value | Appears at zoom | Typical use |
|---|---|---|
| `national` | Always (zoom 0+) | Nationally significant landmarks, major resources |
| `regional` | Zoom 8+ | Statewide or multi-county interest |
| `local` | Zoom 11+ | City or neighbourhood resources (default) |
| `neighborhood` | Zoom 14+ | Hyper-local spots, community spaces |

---

## Workflow

1. **Add a new POI** — fill in a new row with title, lat, lng, and any other fields. Leave `poi_id` blank.
2. **Edit an existing POI** — find its row by `poi_id` and edit any field. Do not change `poi_id`.
3. **Remove a POI** — delete the row (or set `is_verified` to `FALSE` to hide it without deleting).
4. **Sync** — run `npm run sync-pois` to push changes to the database. New rows get their `poi_id` written back automatically.

To export all current database records into the sheet (e.g. after a direct DB edit), run `npm run seed-sheet`. This overwrites the sheet content with the current database state.
