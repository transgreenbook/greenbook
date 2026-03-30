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

function boundarySource(layer: string): SourceSpecification {
  if (pmtilesUrl) {
    const url = pmtilesUrl.startsWith("http")
      ? `pmtiles://${pmtilesUrl}`
      : pmtilesUrl;
    return { type: "vector", url };
  }
  // Fallback: empty GeoJSON until PMTiles URL is configured
  return { type: "geojson", data: { type: "FeatureCollection", features: [] } };
}

export const SOURCES: Record<string, SourceSpecification> = {
  states:           boundarySource("states"),
  "states-centroids": {
    type: "geojson",
    data: "/state-centroids.geojson",
  },
  "counties-centroids": {
    type: "geojson",
    data: "/county-centroids.geojson",
  },
  counties: boundarySource("counties"),
  places: boundarySource("places"),
  "cities-centroids": {
    type: "geojson",
    data: "/city-centroids.geojson",
  },
  "major-cities-centroids": {
    type: "geojson",
    data: "/major-city-centroids.geojson",
  },
  // POIs are loaded dynamically from Supabase — data is swapped in by the POI hook.
  pois: {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50,
  },
};

// ---------------------------------------------------------------------------
// Layers (ordered bottom → top)
// ---------------------------------------------------------------------------

export const LAYERS: LayerSpecification[] = [
  // --- State fills (zoom 3–8) ---
  {
    id: "states-fill",
    type: "fill",
    source: "states",
    ...(pmtilesUrl ? { "source-layer": "states" } : {}),
    paint: {
      "fill-color": ["coalesce", ["get", "fill_color"], "#e0e7ef"],
      // Full opacity at zoom 5, fades out by zoom 8
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        3, 0.7,
        5, 0.7,
        8, 0,
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
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 6, 13],
      "text-anchor": "center",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#334155",
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
      "fill-color": ["coalesce", ["get", "fill_color"], "#f1f5f9"],
      // Fades in as state fills fade out
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        5, 0,
        8, 0.6,
        12, 0.4,
      ],
    },
  },
  {
    id: "counties-line",
    type: "line",
    source: "counties",
    ...(pmtilesUrl ? { "source-layer": "counties" } : {}),
    paint: {
      "line-color": "#cbd5e1",
      "line-width": 0.5,
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
      "text-size": ["interpolate", ["linear"], ["zoom"], 8, 9, 11, 12],
      "text-anchor": "center",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#475569",
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

  // --- Major US city labels (zoom 4–9) ---
  // text-allow-overlap + text-ignore-placement required to override Stadia base map collision grid.
  // Static filter keeps only the top 25 cities so the map isn't cluttered at low zoom.
  {
    id: "major-cities-label",
    type: "symbol",
    source: "major-cities-centroids",
    filter: ["<=", ["get", "rank"], 25],
    layout: {
      "text-field": ["get", "NAME"],
      "text-font": ["literal", ["Open Sans Regular", "Arial Unicode MS Regular"]],
      "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 13],
      "text-anchor": "center",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#1e3a5f",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-opacity": [
        "interpolate", ["linear"], ["zoom"],
        4, 1,
        9, 0,
      ],
    },
  },

  // --- City/place boundaries (zoom 9–12) ---
  {
    id: "cities-fill",
    type: "fill",
    source: "places",
    ...(pmtilesUrl ? { "source-layer": "places" } : {}),
    paint: {
      "fill-color": "#e2e8f0",
      "fill-opacity": [
        "interpolate", ["linear"], ["zoom"],
        8, 0,
        10, 0.15,
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
      "line-width": 0.8,
      "line-opacity": [
        "interpolate", ["linear"], ["zoom"],
        8, 0,
        10, 0.8,
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
      "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 13, 14],
      "text-anchor": "center",
      "text-max-width": 8,
    },
    paint: {
      "text-color": "#1e3a5f",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
      "text-opacity": [
        "interpolate", ["linear"], ["zoom"],
        9, 0,
        10, 1,
      ],
    },
  },

  // --- POI clusters (zoom 9–11) ---
  {
    id: "pois-cluster",
    type: "circle",
    source: "pois",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step", ["get", "point_count"],
        "#60a5fa",   // blue  — < 10
        10, "#f59e0b", // amber — 10–49
        50, "#ef4444", // red   — 50+
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

  // --- Individual POI icons (zoom 12+) ---
  {
    id: "pois-unclustered",
    type: "circle",
    source: "pois",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#3b82f6",
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-opacity": 1,
      "circle-stroke-opacity": 1,
    },
  },
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
