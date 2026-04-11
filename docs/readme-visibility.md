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
