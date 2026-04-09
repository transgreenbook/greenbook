import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import type { Geometry } from "geojson";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import stateBboxes from "@/data/state-bboxes.json";

// Extract all [lng, lat] pairs from a polygon or multipolygon geometry.
function extractCoords(geometry: Geometry): [number, number][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat() as [number, number][];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat(2) as [number, number][];
  }
  return [];
}

// Compute the bounding box of all source features matching a filter.
// Works for both vector tile (PMTiles) and GeoJSON sources.
function sourceBounds(
  map: maplibregl.Map,
  source: string,
  sourceLayer: string,
  filter: maplibregl.FilterSpecification,
): [[number, number], [number, number]] | null {
  const src = map.getSource(source);
  const opts = src?.type === "vector" ? { sourceLayer, filter } : { filter };
  const features = map.querySourceFeatures(source, opts);

  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const f of features) {
    for (const [lng, lat] of extractCoords(f.geometry)) {
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  if (!isFinite(w)) return null;
  // Expand by 8% in each direction to account for tile-clipped polygon edges
  const lngPad = (e - w) * 0.08;
  const latPad = (n - s) * 0.08;
  return [[w - lngPad, s - latPad], [e + lngPad, n + latPad]];
}

export function useMapClick(map: maplibregl.Map | null) {
  const setSelectedPOI    = useMapStore((s) => s.setSelectedPOI);
  const setSelectedRegion = useMapStore((s) => s.setSelectedRegion);
  const flyTo             = useMapStore((s) => s.flyTo);

  // True while the user is browsing states by clicking (programmatic zoom).
  // Cleared as soon as the user manually zooms with scroll/pinch.
  const stateBrowsingRef = useRef(false);

  useEffect(() => {
    if (!map) return;

    // Any user-initiated zoom (scroll wheel, pinch, double-click zoom) carries
    // an originalEvent. Programmatic flyTo/easeTo does not.
    const handleZoomStart = (e: maplibregl.MapLibreEvent) => {
      if (e.originalEvent) {
        stateBrowsingRef.current = false;
      }
    };

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { isRoutingMode, start, end, setStart, setEnd } = useRouteStore.getState();

      // Routing mode — drop a waypoint on the map click
      if (isRoutingMode) {
        const { lng, lat } = e.lngLat;
        const label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        if (!start) {
          setStart({ lng, lat, label });
        } else if (!end) {
          setEnd({ lng, lat, label });
        }
        return;
      }

      // POI layers take priority
      if (map.getLayer("pois-cluster") && map.getLayer("pois-unclustered")) {
        const poiLayers = ["pois-cluster", "pois-unclustered", "pois-unclustered-icons", "pois-along-route"]
          .filter((l) => map.getLayer(l));
        const poiFeatures = map.queryRenderedFeatures(e.point, {
          layers: poiLayers,
        });

        if (poiFeatures.length) {
          const feature = poiFeatures[0];
          if (feature.geometry.type !== "Point") return;
          const center = feature.geometry.coordinates as [number, number];

          if (feature.properties?.cluster_id != null) {
            const source = map.getSource("pois") as maplibregl.GeoJSONSource;
            source
              .getClusterExpansionZoom(feature.properties.cluster_id)
              .then((zoom) => map.easeTo({ center, zoom: Math.max(zoom + 1, 13) }))
              .catch(() => {});
            return;
          }

          const p = feature.properties!;
          flyTo({ lng: center[0], lat: center[1], zoom: Math.max(map.getZoom(), 14) });
          setSelectedRegion(null);
          stateBrowsingRef.current = false;
          setSelectedPOI({
            id: p.id,
            title: p.title,
            description: p.description ?? null,
            category_id: p.category_id ?? null,
            is_verified: p.is_verified,
            tags: p.tags ? JSON.parse(p.tags) : null,
            color: p.color ?? null,
            icon: p.icon ?? null,
            lng: center[0],
            lat: center[1],
          });
          return;
        }
      }

      // Region layers.
      // In state-browsing mode (set by clicking a state, cleared by manual zoom)
      // skip city/county checks so the user can click state-to-state.
      // Otherwise gate by zoom: county at zoom >= 6, city at zoom >= 9.
      const zoom = map.getZoom();
      const inStateBrowsing = stateBrowsingRef.current;

      const cityFeatures = !inStateBrowsing && zoom >= 9 && map.getLayer("cities-fill")
        ? map.queryRenderedFeatures(e.point, { layers: ["cities-fill"] })
        : [];
      const countyFeatures = !inStateBrowsing && zoom >= 6 && map.getLayer("counties-fill")
        ? map.queryRenderedFeatures(e.point, { layers: ["counties-fill"] })
        : [];
      const stateFeatures = map.getLayer("states-fill")
        ? map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })
        : [];

      if (cityFeatures.length) {
        const props   = cityFeatures[0].properties ?? {};
        const name    = props.NAME    ?? "";
        const statefp = props.STATEFP ?? "";
        if (!name) return;

        const bounds = sourceBounds(
          map, "places", "places",
          ["all", ["==", ["get", "NAME"], name], ["==", ["get", "STATEFP"], statefp]] as maplibregl.FilterSpecification,
        );
        if (bounds) {
          flyTo({ lng: 0, lat: 0, bounds });
        }
        setSelectedPOI(null);
        setSelectedRegion({ type: "city", name, statefp });
        return;
      }

      if (countyFeatures.length) {
        const props    = countyFeatures[0].properties ?? {};
        const name     = props.NAME     ?? "";
        const statefp  = props.STATEFP  ?? "";
        const countyfp = props.COUNTYFP ?? "";
        const fips5    = props.GEOID    ?? (statefp + countyfp);
        if (!fips5) return;

        const bounds = sourceBounds(
          map, "counties", "counties",
          ["==", ["get", "GEOID"], fips5] as maplibregl.FilterSpecification,
        );
        if (bounds) {
          flyTo({ lng: 0, lat: 0, bounds });
        }
        setSelectedPOI(null);
        setSelectedRegion({ type: "county", name, fips5 });
        return;
      }

      if (stateFeatures.length) {
        const props     = stateFeatures[0].properties ?? {};
        const stateAbbr = props.STUSPS ?? props.abbreviation ?? "";
        const name      = props.NAME   ?? props.name ?? stateAbbr;
        if (!stateAbbr) return;

        const bbox = (stateBboxes as unknown as Record<string, [number, number, number, number]>)[stateAbbr];
        if (bbox) {
          flyTo({ lng: 0, lat: 0, bounds: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] });
        } else {
          const centroids = map.querySourceFeatures("states-centroids");
          const centroid  = centroids.find((f) => f.properties?.STUSPS === stateAbbr);
          if (centroid?.geometry.type === "Point") {
            const [lng, lat] = centroid.geometry.coordinates as [number, number];
            flyTo({ lng, lat, zoom: 6 });
          }
        }
        setSelectedPOI(null);
        setSelectedRegion({ type: "state", name, stateAbbr });
        stateBrowsingRef.current = true;
        return;
      }
    };

    const setCursor = (e: maplibregl.MapMouseEvent) => {
      const { isRoutingMode } = useRouteStore.getState();
      if (isRoutingMode) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }

      const zoom = map.getZoom();
      const inStateBrowsing = stateBrowsingRef.current;
      const clickableLayers: string[] = [];
      if (map.getLayer("pois-cluster"))          clickableLayers.push("pois-cluster");
      if (map.getLayer("pois-unclustered"))      clickableLayers.push("pois-unclustered");
      if (map.getLayer("pois-unclustered-icons")) clickableLayers.push("pois-unclustered-icons");
      if (map.getLayer("pois-along-route"))      clickableLayers.push("pois-along-route");
      if (!inStateBrowsing && zoom >= 9  && map.getLayer("cities-fill"))   clickableLayers.push("cities-fill");
      if (!inStateBrowsing && zoom >= 6  && map.getLayer("counties-fill")) clickableLayers.push("counties-fill");
      if (map.getLayer("states-fill"))                                      clickableLayers.push("states-fill");

      const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    };

    map.on("zoomstart", handleZoomStart);
    map.on("click", handleClick);
    map.on("mousemove", setCursor);

    return () => {
      map.off("zoomstart", handleZoomStart);
      map.off("click", handleClick);
      map.off("mousemove", setCursor);
    };
  }, [map, setSelectedPOI, setSelectedRegion, flyTo]);
}
