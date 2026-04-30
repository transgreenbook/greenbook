import type { Map, LayerSpecification, SourceSpecification } from "maplibre-gl";

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
// NEXT_PUBLIC_PMTILES_URL points to the boundaries PMTiles file.
// Locally: http://localhost:3000/tiles/boundaries.pmtiles (served from public/)
// Production: pmtiles://https://your-r2-url/boundaries.pmtiles
//
// Layer names ("states", "counties") match the --named-layer values used in
// the tippecanoe command in scripts/build-tiles.sh.
// ---------------------------------------------------------------------------

const pmtilesUrl = process.env.NEXT_PUBLIC_PMTILES_URL;
const basePath   = process.env.NEXT_PUBLIC_BASE_PATH || "";

function boundarySource(
  promoteId?: Record<string, string>,
  maxzoom?: number,
): SourceSpecification {
  if (pmtilesUrl) {
    const absolute = pmtilesUrl.startsWith("/")
      ? `${typeof window !== "undefined" ? window.location.origin : ""}${basePath}${pmtilesUrl}`
      : pmtilesUrl;
    return {
      type: "vector",
      url: `pmtiles://${absolute}`,
      ...(promoteId ? { promoteId } : {}),
      ...(maxzoom != null ? { maxzoom } : {}),
    };
  }
  // Fallback: empty GeoJSON until PMTiles URL is configured
  return { type: "geojson", data: { type: "FeatureCollection", features: [] } };
}

export const SOURCES: Record<string, SourceSpecification> = {
  // States tiles go to zoom 14 — no maxzoom cap needed.
  states:           boundarySource({ states: "STUSPS" }),
  "states-centroids": {
    type: "geojson",
    data: `${basePath}/state-centroids.geojson`,
  },
  // Native American / Alaska Native / Hawaiian Home Land reservation boundaries.
  // Loaded from the TIGER/Line AIANNH shapefile via scripts/build-tiles.sh.
  // Served as a static GeoJSON file (not PMTiles) — ~500 features, manageable size.
  reservations: {
    type: "geojson",
    data: `${basePath}/reservations.geojson`,
    promoteId: "GEOID",
  },
  "reservations-centroids": {
    type: "geojson",
    data: `${basePath}/reservation-centroids.geojson`,
  },
  "counties-centroids": {
    type: "geojson",
    data: `${basePath}/county-centroids.geojson`,
  },
  // Counties and places tiles only go to zoom 12 (built with --maximum-zoom=12).
  // The merged boundaries.pmtiles reports maxzoom 14 (from states), so without
  // an explicit cap MapLibre requests zoom 13/14 tiles for these layers and gets
  // empty results. Setting maxzoom: 12 tells MapLibre to overzoom from zoom 12.
  counties: boundarySource({ counties: "GEOID" }, 12),
  places:   boundarySource({ places: "PLACEFP" }, 12),
  "cities-centroids": {
    type: "geojson",
    data: `${basePath}/city-centroids.geojson`,
  },
  "major-cities-centroids": {
    type: "geojson",
    data: `${basePath}/major-city-centroids.geojson`,
  },
  // POIs are loaded dynamically from Supabase — data is swapped in by the POI hook.
  // Positive/neutral POIs (severity >= 0 or null) — blue clusters.
  pois: {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 50,
  },
  // Negative POIs (severity < 0) — red/amber clusters.
  "pois-negative": {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 50,
  },
  // Route sources — data is swapped in by useRouteLayer / usePOIsAlongRoute.
  "route-buffer": {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  },
  route: {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  },
  "route-waypoints": {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  },
  "pois-along-route": {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  },
  "pois-bbox-selection": {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  },
  // Single-feature source for the currently selected POI — drives the halo layer.
  "pois-selected": {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  },
  // Region-selection POIs — swapped in when a state/county/city is selected.
  "pois-region": {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 50,
  },
};

// ---------------------------------------------------------------------------
// Layers (ordered bottom → top)
// ---------------------------------------------------------------------------

export const LAYERS: LayerSpecification[] = [
  // --- State fills ---
  // Main fill: full opacity at low zoom, fades out by zoom 8.
  {
    id: "states-fill",
    type: "fill",
    source: "states",
    ...(pmtilesUrl ? { "source-layer": "states" } : {}),
    paint: {
      "fill-color": ["coalesce", ["feature-state", "severity_color"], ["get", "fill_color"], "#e0e7ef"],
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        3, 0.7,
        5, 0.7,
        8, 0,
      ],
    },
  },
  // Positive fill: mirrors states-fill for affirming POIs (green channel).
  {
    id: "states-fill-positive",
    type: "fill",
    source: "states",
    ...(pmtilesUrl ? { "source-layer": "states" } : {}),
    paint: {
      "fill-color": ["coalesce", ["feature-state", "positive_color"], "rgba(0,0,0,0)"],
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        3, 0.7,
        5, 0.7,
        8, 0,
      ],
    },
  },
  // Persistent fill: fades IN at zoom 8 (as the main fill fades out) and stays
  // at low opacity. Counties/cities without their own POI are transparent, so
  // the parent state's tint shows through underneath them.
  // Only states with a severity_color show this tint — neutral states are transparent.
  {
    id: "states-fill-persistent",
    type: "fill",
    source: "states",
    ...(pmtilesUrl ? { "source-layer": "states" } : {}),
    paint: {
      "fill-color": ["coalesce", ["feature-state", "severity_color"], "rgba(0,0,0,0)"],
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        7, 0,
        8, 0.3,
      ],
    },
  },
  {
    id: "states-fill-persistent-positive",
    type: "fill",
    source: "states",
    ...(pmtilesUrl ? { "source-layer": "states" } : {}),
    paint: {
      "fill-color": ["coalesce", ["feature-state", "positive_color"], "rgba(0,0,0,0)"],
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        7, 0,
        8, 0.3,
      ],
    },
  },
  {
    id: "states-line",
    type: "line",
    source: "states",
    ...(pmtilesUrl ? { "source-layer": "states" } : {}),
    paint: {
      "line-color": "#94a3b8",
      "line-width": 1,
      "line-opacity": [
        "interpolate", ["linear"], ["zoom"],
        3, 1,
        8, 0,
      ],
    },
  },
  {
    id: "states-label",
    type: "symbol",
    source: "states-centroids",
    layout: {
      "text-field": ["get", "STUSPS"],
      "text-font": ["literal", ["Open Sans Regular", "Arial Unicode MS Regular"]],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 12, 6, 16],
      "text-anchor": "center",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#0f172a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-opacity": [
        "interpolate", ["linear"], ["zoom"],
        3, 1,
        8, 0,
      ],
    },
  },

  // --- County fills (zoom 6–12) ---
  {
    id: "counties-fill",
    type: "fill",
    source: "counties",
    ...(pmtilesUrl ? { "source-layer": "counties" } : {}),
    paint: {
      "fill-color": ["coalesce", ["feature-state", "severity_color"], "#f1f5f9"],
      // Only render if the county has its own severity — otherwise let the
      // persistent state fill show through underneath.
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        5, 0,
        8, ["case", ["!=", ["feature-state", "severity_color"], null], 0.6, 0],
        12, ["case", ["!=", ["feature-state", "severity_color"], null], 0.4, 0],
      ],
    },
  },
  {
    id: "counties-fill-positive",
    type: "fill",
    source: "counties",
    ...(pmtilesUrl ? { "source-layer": "counties" } : {}),
    paint: {
      "fill-color": ["coalesce", ["feature-state", "positive_color"], "rgba(0,0,0,0)"],
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        5, 0,
        8, ["case", ["!=", ["feature-state", "positive_color"], null], 0.6, 0],
        12, ["case", ["!=", ["feature-state", "positive_color"], null], 0.4, 0],
      ],
    },
  },
  {
    id: "counties-line",
    type: "line",
    source: "counties",
    ...(pmtilesUrl ? { "source-layer": "counties" } : {}),
    paint: {
      "line-color": "#b0bec5",
      "line-width": 1,
      "line-opacity": [
        "interpolate", ["linear"], ["zoom"],
        5, 0,
        7, 1,
        12, 1,
      ],
    },
  },

  // --- County labels (zoom 8–12) ---
  {
    id: "counties-label",
    type: "symbol",
    source: "counties-centroids",
    layout: {
      "text-field": ["get", "NAME"],
      "text-font": ["literal", ["Open Sans Regular", "Arial Unicode MS Regular"]],
      "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 11, 14],
      "text-anchor": "center",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#0f172a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-opacity": [
        "interpolate", ["linear"], ["zoom"],
        7, 0,
        8, 1,
        12, 1,
      ],
    },
  },

  // --- Major US city dots + labels ---
  // Two tiers by population rank. text-allow-overlap + text-ignore-placement are required
  // to override Stadia's base-map collision grid. Zoom-based density is achieved via
  // separate layers with static rank filters and different opacity fade-in points.

  // Tier 1: top 10 cities — visible from zoom 4
  {
    id: "major-cities-dot",
    type: "circle",
    source: "major-cities-centroids",
    filter: ["<=", ["get", "rank"], 27],
    paint: {
      "circle-radius": 3,
      "circle-color": "#1e3a5f",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 4, 1, 9, 0],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 4, 1, 9, 0],
    },
  },
  {
    id: "major-cities-label",
    type: "symbol",
    source: "major-cities-centroids",
    filter: ["<=", ["get", "rank"], 27],
    layout: {
      "text-field": ["get", "NAME"],
      "text-font": ["literal", ["Open Sans Regular", "Arial Unicode MS Regular"]],
      "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 15],
      "text-anchor": "left",
      "text-offset": [0.6, 0],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#0f172a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 4, 1, 9, 0],
    },
  },

  // Tier 2: ranks 11–25 — fade in at zoom 6
  {
    id: "major-cities-dot-2",
    type: "circle",
    source: "major-cities-centroids",
    filter: ["all", [">", ["get", "rank"], 27], ["<=", ["get", "rank"], 50]],
    paint: {
      "circle-radius": 3,
      "circle-color": "#1e3a5f",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 6, 1, 9, 0],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 6, 1, 9, 0],
    },
  },
  {
    id: "major-cities-label-2",
    type: "symbol",
    source: "major-cities-centroids",
    filter: ["all", [">", ["get", "rank"], 27], ["<=", ["get", "rank"], 50]],
    layout: {
      "text-field": ["get", "NAME"],
      "text-font": ["literal", ["Open Sans Regular", "Arial Unicode MS Regular"]],
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 12, 8, 15],
      "text-anchor": "left",
      "text-offset": [0.6, 0],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#0f172a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 6, 1, 9, 0],
    },
  },

  // --- City/place boundaries (zoom 9–12) ---
  {
    id: "cities-fill",
    type: "fill",
    source: "places",
    ...(pmtilesUrl ? { "source-layer": "places" } : {}),
    paint: {
      "fill-color": ["coalesce", ["feature-state", "severity_color"], "#e2e8f0"],
      // Only render if the city has its own severity — otherwise let the
      // persistent state fill show through underneath.
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        8, 0,
        10, ["case", ["!=", ["feature-state", "severity_color"], null], 0.55, 0],
      ],
    },
  },
  {
    id: "cities-fill-positive",
    type: "fill",
    source: "places",
    ...(pmtilesUrl ? { "source-layer": "places" } : {}),
    paint: {
      "fill-color": ["coalesce", ["feature-state", "positive_color"], "rgba(0,0,0,0)"],
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        8, 0,
        10, ["case", ["!=", ["feature-state", "positive_color"], null], 0.55, 0],
      ],
    },
  },
  {
    id: "cities-line",
    type: "line",
    source: "places",
    ...(pmtilesUrl ? { "source-layer": "places" } : {}),
    paint: {
      "line-color": "#94a3b8",
      "line-width": 1,
      "line-opacity": [
        "interpolate", ["linear"], ["zoom"],
        8, 0,
        10, 1,
      ],
    },
  },
  {
    id: "cities-label",
    type: "symbol",
    source: "cities-centroids",
    layout: {
      "text-field": ["get", "NAME"],
      "text-font": ["literal", ["Open Sans Regular", "Arial Unicode MS Regular"]],
      "text-size": ["interpolate", ["linear"], ["zoom"], 9, 12, 13, 16],
      "text-anchor": "center",
      "text-max-width": 8,
    },
    paint: {
      "text-color": "#0f172a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-opacity": [
        "interpolate", ["linear"], ["zoom"],
        9, 0,
        10, 1,
      ],
    },
  },

  // --- Reservation fills (zoom 4–10) ---
  // Rendered AFTER counties and cities. A near-opaque cover layer blocks the
  // persistent state tint from bleeding through the semi-transparent amber fill.
  {
    id: "reservations-fill-cover",
    type: "fill",
    source: "reservations",
    paint: {
      "fill-color": "#fffbeb",
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        4, 0.75,
        10, 0.75,
      ],
    },
  },
  {
    id: "reservations-fill",
    type: "fill",
    source: "reservations",
    paint: {
      "fill-color": "#fef3c7",
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        4, 0.5,
        7, 0.35,
        10, 0.2,
      ],
    },
  },
  {
    id: "reservations-line",
    type: "line",
    source: "reservations",
    paint: {
      "line-color": "#d97706",
      "line-width": 1.2,
      "line-dasharray": [3, 2],
      "line-opacity": [
        "interpolate", ["linear"], ["zoom"],
        4, 0.8,
        10, 0.5,
      ],
    },
  },
  {
    id: "reservations-label",
    type: "symbol",
    source: "reservations-centroids",
    layout: {
      "text-field": ["get", "NAME"],
      "text-font": ["literal", ["Open Sans Regular", "Arial Unicode MS Regular"]],
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 9, 13],
      "text-anchor": "center",
      "text-max-width": 8,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#92400e",
      "text-halo-color": "#fffbeb",
      "text-halo-width": 1.5,
      "text-opacity": [
        "interpolate", ["linear"], ["zoom"],
        5, 0,
        6, 1,
        10, 1,
      ],
    },
  },

  // --- Region selection highlights ---
  {
    id: "reservations-highlight",
    type: "fill",
    source: "reservations",
    filter: ["==", ["get", "GEOID"], ""],
    paint: { "fill-color": "#f59e0b", "fill-opacity": 0.45 },
  },
  {
    id: "states-highlight",
    type: "fill",
    source: "states",
    ...(pmtilesUrl ? { "source-layer": "states" } : {}),
    filter: ["==", ["get", "STUSPS"], ""],
    paint: { "fill-color": "#f59e0b", "fill-opacity": 0.3 },
  },
  {
    id: "counties-highlight",
    type: "fill",
    source: "counties",
    ...(pmtilesUrl ? { "source-layer": "counties" } : {}),
    filter: ["==", ["get", "GEOID"], ""],
    paint: { "fill-color": "#f59e0b", "fill-opacity": 0.4 },
  },
  {
    id: "cities-highlight",
    type: "fill",
    source: "places",
    ...(pmtilesUrl ? { "source-layer": "places" } : {}),
    filter: ["all", ["==", ["get", "NAME"], ""], ["==", ["get", "STATEFP"], ""]],
    paint: { "fill-color": "#f59e0b", "fill-opacity": 0.4 },
  },

  // --- Route buffer (POI search radius shade) ---
  // Rendered as a GeoJSON polygon computed in usePOIsAlongRoute so it scales
  // correctly at all zoom levels without the tile-clipping artifacts of wide lines.
  {
    id: "route-buffer-fill",
    type: "fill",
    source: "route-buffer",
    paint: {
      "fill-color": "#3b82f6",
      "fill-opacity": 0.08,
    },
  },
  {
    id: "route-buffer-outline",
    type: "line",
    source: "route-buffer",
    paint: {
      "line-color": "#3b82f6",
      "line-width": 1,
      "line-opacity": 0.2,
      "line-dasharray": [4, 4],
    },
  },

  // --- Route line ---
  {
    id: "route-line",
    type: "line",
    source: "route",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#3b82f6",
      "line-width": 4,
      "line-opacity": 0.85,
    },
  },

  // --- Selected POI halo (renders behind all POI layers) ---
  {
    id: "pois-selected-halo",
    type: "circle",
    source: "pois-selected",
    paint: {
      "circle-radius": 20,
      "circle-color": ["coalesce", ["get", "color"], "#f59e0b"],
      "circle-opacity": 0.25,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": ["coalesce", ["get", "color"], "#f59e0b"],
      "circle-stroke-opacity": 0.5,
    },
  },

  // --- Box-selection POIs (highlighted) ---
  {
    id: "pois-bbox-selection",
    type: "circle",
    source: "pois-bbox-selection",
    paint: {
      "circle-color": ["coalesce", ["get", "color"], "#f59e0b"],
      "circle-radius": 9,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 1,
      "circle-stroke-opacity": 1,
    },
  },

  // --- POIs along route (highlighted) ---
  {
    id: "pois-along-route",
    type: "circle",
    source: "pois-along-route",
    paint: {
      "circle-color": ["coalesce", ["get", "color"], "#f59e0b"],
      "circle-radius": 9,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 1,
      "circle-stroke-opacity": 1,
    },
  },

  // --- Route waypoint pins ---
  {
    id: "route-start",
    type: "circle",
    source: "route-waypoints",
    filter: ["==", ["get", "type"], "start"],
    paint: {
      "circle-radius": 9,
      "circle-color": "#22c55e",
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 1,
      "circle-stroke-opacity": 1,
    },
  },
  {
    id: "route-end",
    type: "circle",
    source: "route-waypoints",
    filter: ["==", ["get", "type"], "end"],
    paint: {
      "circle-radius": 9,
      "circle-color": "#ef4444",
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 1,
      "circle-stroke-opacity": 1,
    },
  },

  // --- Region-selection POI clusters ---
  {
    id: "pois-region-cluster",
    type: "circle",
    source: "pois-region",
    filter: ["has", "point_count"],
    layout: { visibility: "none" },
    paint: {
      "circle-color": "#60a5fa",
      "circle-radius": [
        "step", ["get", "point_count"],
        16,
        10, 22,
        50, 28,
      ],
      "circle-opacity": 1,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 1,
    },
  },
  {
    id: "pois-region-cluster-count",
    type: "symbol",
    source: "pois-region",
    filter: ["has", "point_count"],
    layout: {
      visibility: "none",
      "text-field": "{point_count_abbreviated}",
      "text-font": ["Open Sans Bold"],
      "text-size": 12,
    },
    paint: {
      "text-color": "#ffffff",
      "text-opacity": 1,
    },
  },
  {
    id: "pois-region-unclustered",
    type: "circle",
    source: "pois-region",
    filter: ["all", ["!", ["has", "point_count"]], ["!", ["to-boolean", ["get", "icon"]]]],
    layout: { visibility: "none" },
    paint: {
      "circle-color": ["coalesce", ["get", "color"], "#3b82f6"],
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 1,
      "circle-stroke-opacity": 1,
    },
  },
  {
    id: "pois-region-unclustered-icons",
    type: "symbol",
    source: "pois-region",
    filter: ["all", ["!", ["has", "point_count"]], ["to-boolean", ["get", "icon"]]],
    layout: {
      visibility: "none",
      "icon-image": ["get", "icon"],
      "icon-size": 1,
      "icon-allow-overlap": true,
      "icon-anchor": "center",
    },
  } as LayerSpecification,

  // --- POI clusters — positive/neutral (zoom 9–11, blue) ---
  {
    id: "pois-cluster",
    type: "circle",
    source: "pois",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#60a5fa",
      "circle-radius": [
        "step", ["get", "point_count"],
        16,
        10, 22,
        50, 28,
      ],
      "circle-opacity": 1,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 1,
    },
  },
  {
    id: "pois-cluster-count",
    type: "symbol",
    source: "pois",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["Open Sans Bold"],
      "text-size": 12,
    },
    paint: {
      "text-color": "#ffffff",
      "text-opacity": 1,
    },
  },

  // --- POI clusters — negative (zoom 9–11, red/amber) ---
  {
    id: "pois-negative-cluster",
    type: "circle",
    source: "pois-negative",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step", ["get", "point_count"],
        "#f59e0b",   // amber — < 10
        10, "#ef4444", // red   — 10+
      ],
      "circle-radius": [
        "step", ["get", "point_count"],
        16,
        10, 22,
        50, 28,
      ],
      "circle-opacity": 1,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 1,
    },
  },
  {
    id: "pois-negative-cluster-count",
    type: "symbol",
    source: "pois-negative",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["Open Sans Bold"],
      "text-size": 12,
    },
    paint: {
      "text-color": "#ffffff",
      "text-opacity": 1,
    },
  },

  // --- Individual POI circles — POIs without a named icon (zoom 12+) ---
  {
    id: "pois-unclustered",
    type: "circle",
    source: "pois",
    filter: ["all", ["!", ["has", "point_count"]], ["!", ["to-boolean", ["get", "icon"]]]],
    paint: {
      "circle-color": ["coalesce", ["get", "color"], "#3b82f6"],
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 1,
      "circle-stroke-opacity": 1,
    },
  },

  // --- Individual negative POI circles (zoom 12+) ---
  {
    id: "pois-negative-unclustered",
    type: "circle",
    source: "pois-negative",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": ["coalesce", ["get", "color"], "#ef4444"],
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 1,
      "circle-stroke-opacity": 1,
    },
  },

  // --- Individual POI symbols — POIs with a named icon (zoom 12+) ---
  {
    id: "pois-unclustered-icons",
    type: "symbol",
    source: "pois",
    filter: ["all", ["!", ["has", "point_count"]], ["to-boolean", ["get", "icon"]]],
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": 1,
      "icon-allow-overlap": true,
      "icon-anchor": "center",
    },
  } as LayerSpecification,
];

// ---------------------------------------------------------------------------
// Register all sources and layers on a MapLibre map instance
// ---------------------------------------------------------------------------

export function registerLayers(map: Map) {
  for (const [id, source] of Object.entries(SOURCES)) {
    if (!map.getSource(id)) {
      map.addSource(id, source);
    }
  }
  for (const layer of LAYERS) {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer);
    }
  }
}
