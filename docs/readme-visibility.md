# Visibility Rules (Design Notes)

This document captures the planned design for a `data/visibility-rules.json` system, analogous to `data/severity-rules.json`, that controls how POIs are sorted and filtered in the POI pane beyond simple user-toggled category filters.

---

## Motivation

The current POI list sort order (most-negative severity first) is hardcoded. As the dataset grows we'll want to tune:

- What gets surfaced to a traveller passing through quickly vs. someone planning a longer stay
- How to balance recency against severity (a 3-year-old -10 incident vs. a brand-new -6 law)
- Whether certain categories should always pin to the top
- Whether stale entries should auto-hide from the pane even if they're still on the map

Rather than re-deploying code every time we change the algorithm, the rules should live in a JSON file that feeds both the UI sort logic and any future server-side ranking.

---

## Proposed Structure

```json
{
  "_comment": "Controls POI pane sort order and auto-hide logic. Edit and redeploy (no DB changes needed).",
  "_version": "1.0",

  "sort": {
    "primary":   "severity_asc",
    "tiebreak":  "recency_desc"
  },

  "pin_top": ["safety-incident"],

  "auto_hide": {
    "safety-incident": { "older_than_days": 730 },
    "law-antitrans":   { "min_severity": -1 }
  },

  "score_weights": {
    "_comment": "Future: composite score = severity_weight * severity + recency_weight * recency_score",
    "severity":  1.0,
    "recency":   0.0
  }
}
```

---

## Fields

### `sort`

| Field | Options | Notes |
|-------|---------|-------|
| `primary` | `severity_asc`, `severity_desc`, `recency_desc`, `recency_asc`, `score_desc` | Default: `severity_asc` (most negative first) |
| `tiebreak` | Same options | Applied when primary values are equal |

### `pin_top`

Array of `icon_slug` values whose POIs always appear before the sorted list regardless of severity. Useful for safety incidents when a region has both laws and a recent attack.

### `auto_hide`

Per-category rules for hiding POIs from the pane (not the map). Useful for keeping the list focused on what matters to a traveller today.

| Key | Type | Effect |
|-----|------|--------|
| `older_than_days` | number | Hide if `enacted_date` is older than N days |
| `min_severity` | number | Hide if `severity > min_severity` (e.g., `-1` hides 0 and positive) |

### `score_weights` (future)

When `sort.primary = "score_desc"`, the composite score is:

```
score = severity_weight * normalized_severity + recency_weight * recency_score
```

This lets us tune how much recency matters vs. raw severity magnitude without changing code.

---

## Implementation Plan

1. Create `data/visibility-rules.json` with the structure above.
2. Add a `useVisibilityRules` hook that reads/imports the JSON (static import, no runtime fetch needed).
3. Replace the `.sort((a, b) => ...)` logic in `RegionPOIPanel` and `RoutePOIPanel` with a call to `applyVisibilityRules(pois, rules)`.
4. The `applyVisibilityRules` function: filter out auto-hidden POIs → partition pinned vs. normal → sort each partition → concatenate.

No database changes required — all logic runs client-side on the already-fetched POI list.

---

## Current Hardcoded Behaviors (candidates for visibility-rules)

These behaviors are implemented but not yet configurable via a rules file:

### Parent-region inheritance

When a user clicks a **county**, the panel shows that county's POIs merged with all state-level POIs for the parent state. When a user clicks a **city**, it shows city POIs merged with all state-level POIs. The route sidebar does the same for every state the route passes through.

Currently: **all parent-state POIs are shown**, sorted by severity.

With visibility-rules, this could be controlled via:
```json
{
  "parent_region": {
    "county_from_state": { "min_severity": -5, "limit": 5 },
    "city_from_state":   { "min_severity": -5, "limit": 5 },
    "route_from_state":  { "min_severity": -3, "limit": 3 }
  }
}
```
This would let us show only the most impactful state laws (e.g., severity ≤ -5) instead of all of them — useful as more laws are added and the lists grow long.

### Sort order

POIs are sorted by severity ascending (most negative first) in `RegionPOIPanel` and `RoutePOIPanel`. This is hardcoded in the component. Moving it to `visibility-rules.json → sort.primary` would make it adjustable without a code deploy.

---

## Federal Laws — Separate Tab (not visibility-rules)

Federal laws and policies are **out of scope for the region/route POI system** because they apply everywhere and cannot be avoided by choosing a different route or destination. Showing them in state/county panels would make them appear redundantly on every single click with no actionable difference.

**Design decision:** Federal content lives in a dedicated **Federal** tab in the app sidebar, positioned before the About tab. The tab is informational — framed as "know before you go" context rather than route-specific warnings.

**Planned content:**
- Active federal laws in effect (e.g., military service restrictions, Medicaid coverage rules, passport gender marker policy)
- Bills currently moving through Congress (sourced from ProPublica Congress API)
- Federal agency policies affecting travellers (TSA screening, federal prison placement, federal ID rules)

**Data model:** Federal entries may use a new `effect_scope: "federal"` value (distinct from `"state"`, `"county"`, `"city"`, `"point"`) or be stored in a separate table/JSON file — TBD when the tab is built. They are **not** included in `pois_along_route` or `pois_in_state/county/city` queries.

---

## Jurisdictional Override Zones (Future Problem)

Several geographic areas do not follow the normal state → county → city authority hierarchy. No data or UI exists for these yet, but the architecture should not accidentally rule them out.

### Federal Enclaves

Washington DC, military installations, national parks, and other federal land operate under federal jurisdiction. State laws may not apply, be preempted, or conflict with federal policy. Examples where this matters:

- A bathroom ban enacted by a state may not apply on a federal military base in that state
- DC has its own non-discrimination laws that are stronger than any state, but no state authority — it is effectively its own jurisdiction
- National park facilities are federally managed and subject to federal non-discrimination rules regardless of surrounding state law

**Risk for travellers:** The *absence* of a state law on federal land is not always protective — it may mean the federal baseline (which may be weaker in some administrations) applies instead.

**Design consideration:** We may eventually want a `reservations` / `federal_zones` polygon layer and an `effect_scope: "federal_enclave"` value that suppresses state/county POIs when a point falls inside the enclave and shows a note instead.

### Native American Reservations

Tribal nations have sovereign jurisdiction over their territories. State laws generally do not apply on tribal land. Tribes may have their own laws, which could be more or less protective than the surrounding state.

**Boundary data:** The US Census Bureau TIGER/Line **AIANNH** (American Indian Areas, Alaska Native Areas, and Hawaiian Home Lands) shapefile is the standard source. It covers federally recognized reservations, off-reservation trust land, and Alaska Native Villages. Same data family as county/city TIGER shapefiles; could be loaded into a `reservations` PostGIS table with actual polygons (not bboxes — boundaries are too irregular for bbox intersection to be meaningful).

**BIA (Bureau of Indian Affairs)** also maintains official boundary data and is the authoritative federal source.

**Design consideration:** When a route passes through or a user clicks on a reservation, the current state POI queries would return state-level laws that may not actually apply. Ideally we would detect the intersection, suppress or annotate state POIs, and note that tribal law governs. No tribal law data exists yet — this is a known gap.

**Current status:** Reservation boundaries are now loaded from the TIGER/Line AIANNH shapefile (via `scripts/build-tiles.sh` + `scripts/seed-boundaries.sh`). Reservations show on the map and are clickable. The panel displays a jurisdictional note. No tribal law data exists yet — gather data before adding entries.

**Important framing:** Some tribal nations may be *more* protective of trans and Two-Spirit people than the surrounding state. The Two-Spirit identity is recognized in many Indigenous cultures, and some nations have explicit protections or welcoming policies. Reservations in hostile states could serve as meaningful refuges. The panel should reflect positive entries as we gather data, not just warnings. This is a significant gap to fill.
