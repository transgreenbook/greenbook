import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { useRouteStore } from "@/store/routeStore";
import { fetchRoute } from "@/lib/routing";
import type { RoutePOI } from "@/store/routeStore";
import { usePOIsAlongRoute } from "@/hooks/usePOIsAlongRoute";

// Sync route line to the "route" MapLibre source
function setRouteSource(map: maplibregl.Map, coordinates: [number, number][] | null) {
  const source = map.getSource("route") as GeoJSONSource | undefined;
  if (!source) return;
  source.setData({
    type: "FeatureCollection",
    features: coordinates
      ? [{ type: "Feature", geometry: { type: "LineString", coordinates }, properties: {} }]
      : [],
  });
}

// Sync start/end pins to the "route-waypoints" MapLibre source
function setWaypointSource(
  map: maplibregl.Map,
  start: { lng: number; lat: number } | null,
  end: { lng: number; lat: number } | null
) {
  const source = map.getSource("route-waypoints") as GeoJSONSource | undefined;
  if (!source) return;
  const features = [];
  if (start) features.push({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [start.lng, start.lat] },
    properties: { type: "start" },
  });
  if (end) features.push({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [end.lng, end.lat] },
    properties: { type: "end" },
  });
  source.setData({ type: "FeatureCollection", features });
}

// Sync POIs along route to the "pois-along-route" MapLibre source
function setPoisAlongRouteSource(map: maplibregl.Map, pois: RoutePOI[]) {
  const source = map.getSource("pois-along-route") as GeoJSONSource | undefined;
  if (!source) return;
  source.setData({
    type: "FeatureCollection",
    features: pois.map((poi) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [poi.lng, poi.lat] },
      properties: {
        id: poi.id,
        title: poi.title,
        description: poi.description,
        category_id: poi.category_id,
        color: poi.color,
        tags: poi.tags ? JSON.stringify(poi.tags) : null,
        is_verified: poi.is_verified,
      },
    })),
  });
}

export function useRouteLayer(map: maplibregl.Map | null) {
  const start          = useRouteStore((s) => s.start);
  const end            = useRouteStore((s) => s.end);
  const route          = useRouteStore((s) => s.route);
  const poisAlongRoute = useRouteStore((s) => s.poisAlongRoute);
  const setRoute       = useRouteStore((s) => s.setRoute);
  const setLoading     = useRouteStore((s) => s.setLoading);
  const setError       = useRouteStore((s) => s.setError);

  usePOIsAlongRoute(map);

  // Effect 1: fetch the route when both waypoints are set.
  // Does NOT search POIs — that waits until the map has finished fitting to the route.
  useEffect(() => {
    if (!start || !end) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRoute(start, end)
      .then((result) => {
        if (!cancelled) setRoute(result);
        // Keep isLoading=true — usePOIsAlongRoute will clear it after the POI search.
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [start, end]);

  // Effect 2: draw the route line when route data arrives; clear it when route is null.
  // Viewport fitting and POI search are handled by usePOIsAlongRoute.
  useEffect(() => {
    if (!map) return;
    setRouteSource(map, route ? route.coordinates : null);
  }, [map, route]);

  // Sync waypoints to map
  useEffect(() => {
    if (!map) return;
    setWaypointSource(map, start, end);
  }, [map, start, end]);

  // Sync POIs along route to map
  useEffect(() => {
    if (!map) return;
    setPoisAlongRouteSource(map, poisAlongRoute);
  }, [map, poisAlongRoute]);

  // Clear all route map data when routing mode is off
  useEffect(() => {
    if (!map) return;
    const { isRoutingMode } = useRouteStore.getState();
    if (!isRoutingMode) {
      setRouteSource(map, null);
      setWaypointSource(map, null, null);
      setPoisAlongRouteSource(map, []);
    }
  }, [map, useRouteStore((s) => s.isRoutingMode)]);
}
