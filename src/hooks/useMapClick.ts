import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import type { Geometry } from "geojson";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import { useAppStore } from "@/store/appStore";
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

    // Any user-initiated zoom carries an originalEvent. Programmatic flyTo/easeTo does not.
    const handleZoomStart = (e: maplibregl.MapLibreEvent) => {
      if (e.originalEvent) stateBrowsingRef.current = false;
    };
    // When a programmatic zoom ends (e.g. the flyTo after clicking a state),
    // exit state-browsing mode so the user can immediately click cities/counties.
    const handleZoomEnd = (e: maplibregl.MapLibreEvent) => {
      if (!e.originalEvent) stateBrowsingRef.current = false;
    };

    // Select a region from rendered features at a point, without zooming.
    const selectRegionAt = (point: maplibregl.Point): boolean => {
      const zoom = map.getZoom();
      const inStateBrowsing = stateBrowsingRef.current;

      const cityFeatures = !inStateBrowsing && zoom >= 9 && map.getLayer("cities-fill")
        ? map.queryRenderedFeatures(point, { layers: ["cities-fill"] })
        : [];
      const reservationFeatures = !inStateBrowsing && zoom >= 5 && map.getLayer("reservations-fill")
        ? map.queryRenderedFeatures(point, { layers: ["reservations-fill"] })
        : [];
      const countyFeatures = !inStateBrowsing && zoom >= 6 && map.getLayer("counties-fill")
        ? map.queryRenderedFeatures(point, { layers: ["counties-fill"] })
        : [];
      const stateFeatures = map.getLayer("states-fill")
        ? map.queryRenderedFeatures(point, { layers: ["states-fill"] })
        : [];

      if (cityFeatures.length) {
        const props   = cityFeatures[0].properties ?? {};
        const name    = props.NAME    ?? "";
        const statefp = props.STATEFP ?? "";
        if (!name) return false;
        setSelectedPOI(null);
        setSelectedRegion({ type: "city", name, statefp });
        return true;
      }

      if (reservationFeatures.length) {
        const props = reservationFeatures[0].properties ?? {};
        const name  = props.NAMELSAD ?? props.NAME ?? "";
        const geoid = props.GEOID ?? "";
        if (!geoid) return false;
        setSelectedPOI(null);
        setSelectedRegion({ type: "reservation", name, geoid });
        return true;
      }

      if (countyFeatures.length) {
        const props    = countyFeatures[0].properties ?? {};
        const name     = props.NAME     ?? "";
        const statefp  = props.STATEFP  ?? "";
        const countyfp = props.COUNTYFP ?? "";
        const fips5    = props.GEOID    ?? (statefp + countyfp);
        if (!fips5) return false;
        setSelectedPOI(null);
        setSelectedRegion({ type: "county", name, fips5 });
        return true;
      }

      if (stateFeatures.length) {
        const props     = stateFeatures[0].properties ?? {};
        const stateAbbr = props.STUSPS ?? props.abbreviation ?? "";
        const name      = props.NAME   ?? props.name ?? stateAbbr;
        if (!stateAbbr) return false;
        setSelectedPOI(null);
        setSelectedRegion({ type: "state", name, stateAbbr });
        return true;
      }

      return false;
    };

    const handleContextMenu = (e: maplibregl.MapMouseEvent) => {
      // POI right-click: select without flying to it (skip clusters — no zoom action makes sense)
      if (map.getLayer("pois-unclustered")) {
        const bboxOpen = useMapStore.getState().boxSelectionBounds !== null;
        const poiLayers = [
          "pois-unclustered", "pois-negative-unclustered",
          "pois-unclustered-icons", "pois-along-route",
          ...(bboxOpen ? ["pois-bbox-selection"] : []),
        ].filter((l) => map.getLayer(l));
        const poiFeatures = map.queryRenderedFeatures(e.point, { layers: poiLayers });
        if (poiFeatures.length) {
          const feature = poiFeatures[0];
          if (feature.geometry.type !== "Point") return;
          const [lng, lat] = feature.geometry.coordinates as [number, number];
          const p = feature.properties!;
          setSelectedRegion(null);
          setSelectedPOI({
            id: p.id,
            title: p.title,
            description: p.description ?? null,
            long_description: null,
            category_id: p.category_id ?? null,
            is_verified: p.is_verified,
            tags: p.tags ? JSON.parse(p.tags) : null,
            color: p.color ?? null,
            icon: p.icon ?? null,
            lng,
            lat,
          });
          useAppStore.getState().openPOI();
          return;
        }
      }

      selectRegionAt(e.point);
    };

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { isRoutingMode, start, end, setStart, setEnd } = useRouteStore.getState();

      // Routing mode — drop a waypoint if either slot is still empty,
      // otherwise fall through so the user can click POIs on the route.
      if (isRoutingMode) {
        if (!start || !end) {
          const { lng, lat } = e.lngLat;
          const label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          if (!start) setStart({ lng, lat, label });
          else setEnd({ lng, lat, label });
          return;
        }
      }

      // POI layers take priority
      if (map.getLayer("pois-cluster") && map.getLayer("pois-unclustered")) {
        const bboxOpen = useMapStore.getState().boxSelectionBounds !== null;
        const poiLayers = [
          "pois-cluster", "pois-negative-cluster",
          "pois-unclustered", "pois-negative-unclustered",
          "pois-unclustered-icons", "pois-along-route",
          ...(bboxOpen ? ["pois-bbox-selection"] : []),
        ].filter((l) => map.getLayer(l));
        const poiFeatures = map.queryRenderedFeatures(e.point, {
          layers: poiLayers,
        });

        if (poiFeatures.length) {
          const feature = poiFeatures[0];
          if (feature.geometry.type !== "Point") return;
          const center = feature.geometry.coordinates as [number, number];

          if (feature.properties?.cluster_id != null) {
            const sourceId = feature.layer.source as string;
            const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
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
            long_description: null,
            category_id: p.category_id ?? null,
            is_verified: p.is_verified,
            tags: p.tags ? JSON.parse(p.tags) : null,
            color: p.color ?? null,
            icon: p.icon ?? null,
            lng: center[0],
            lat: center[1],
          });
          useAppStore.getState().openPOI();
          return;
        }
      }

      // Region layers — left-click zooms in then selects.
      // In state-browsing mode skip city/county/reservation so the user can click state-to-state.
      const zoom = map.getZoom();
      const inStateBrowsing = stateBrowsingRef.current;

      const cityFeatures = !inStateBrowsing && zoom >= 9 && map.getLayer("cities-fill")
        ? map.queryRenderedFeatures(e.point, { layers: ["cities-fill"] })
        : [];
      const reservationFeatures = !inStateBrowsing && zoom >= 5 && map.getLayer("reservations-fill")
        ? map.queryRenderedFeatures(e.point, { layers: ["reservations-fill"] })
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
        if (bounds) flyTo({ lng: 0, lat: 0, bounds });
        setSelectedPOI(null);
        useMapStore.getState().setBoxSelectionBounds(null);
        setSelectedRegion({ type: "city", name, statefp });
        useAppStore.getState().setMode("map");
        return;
      }

      if (reservationFeatures.length) {
        const props = reservationFeatures[0].properties ?? {};
        const name  = props.NAMELSAD ?? props.NAME ?? "";
        const geoid = props.GEOID ?? "";
        if (!geoid) return;
        const bounds = sourceBounds(
          map, "reservations", "reservations",
          ["==", ["get", "GEOID"], geoid] as maplibregl.FilterSpecification,
        );
        if (bounds) flyTo({ lng: 0, lat: 0, bounds });
        setSelectedPOI(null);
        useMapStore.getState().setBoxSelectionBounds(null);
        setSelectedRegion({ type: "reservation", name, geoid });
        useAppStore.getState().setMode("map");
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
        if (bounds) flyTo({ lng: 0, lat: 0, bounds });
        setSelectedPOI(null);
        useMapStore.getState().setBoxSelectionBounds(null);
        setSelectedRegion({ type: "county", name, fips5 });
        useAppStore.getState().setMode("map");
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
        useMapStore.getState().setBoxSelectionBounds(null);
        setSelectedRegion({ type: "state", name, stateAbbr });
        useAppStore.getState().setMode("map");
        stateBrowsingRef.current = true;
        return;
      }
    };

    const setCursor = (e: maplibregl.MapMouseEvent) => {
      const { isRoutingMode, start, end } = useRouteStore.getState();
      // Show crosshair only while waypoints still need to be placed
      if (isRoutingMode && !(start && end)) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }

      const zoom = map.getZoom();
      const inStateBrowsing = stateBrowsingRef.current;
      const clickableLayers: string[] = [];
      if (map.getLayer("pois-cluster"))           clickableLayers.push("pois-cluster");
      if (map.getLayer("pois-negative-cluster"))  clickableLayers.push("pois-negative-cluster");
      if (map.getLayer("pois-unclustered"))       clickableLayers.push("pois-unclustered");
      if (map.getLayer("pois-negative-unclustered")) clickableLayers.push("pois-negative-unclustered");
      if (map.getLayer("pois-unclustered-icons")) clickableLayers.push("pois-unclustered-icons");
      if (map.getLayer("pois-along-route"))       clickableLayers.push("pois-along-route");
      if (useMapStore.getState().boxSelectionBounds !== null && map.getLayer("pois-bbox-selection"))
        clickableLayers.push("pois-bbox-selection");
      if (!inStateBrowsing && zoom >= 9  && map.getLayer("cities-fill"))       clickableLayers.push("cities-fill");
      if (!inStateBrowsing && zoom >= 5  && map.getLayer("reservations-fill")) clickableLayers.push("reservations-fill");
      if (!inStateBrowsing && zoom >= 6  && map.getLayer("counties-fill"))     clickableLayers.push("counties-fill");
      if (map.getLayer("states-fill"))                                          clickableLayers.push("states-fill");

      const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    };

    map.on("zoomstart", handleZoomStart);
    map.on("zoomend", handleZoomEnd);
    map.on("click", handleClick);
    map.on("contextmenu", handleContextMenu);
    map.on("mousemove", setCursor);

    return () => {
      map.off("zoomstart", handleZoomStart);
      map.off("zoomend", handleZoomEnd);
      map.off("click", handleClick);
      map.off("contextmenu", handleContextMenu);
      map.off("mousemove", setCursor);
    };
  }, [map, setSelectedPOI, setSelectedRegion, flyTo]);
}
