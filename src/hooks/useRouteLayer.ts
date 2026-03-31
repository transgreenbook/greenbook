import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { useRouteStore } from "@/store/routeStore";
import { fetchRoute } from "@/lib/routing";
import { supabase } from "@/lib/supabase";
import type { RoutePOI } from "@/store/routeStore";

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
  const start = useRouteStore((s) => s.start);
  const end = useRouteStore((s) => s.end);
  const route = useRouteStore((s) => s.route);
  const poisAlongRoute = useRouteStore((s) => s.poisAlongRoute);
  const setRoute = useRouteStore((s) => s.setRoute);
  const setPoisAlongRoute = useRouteStore((s) => s.setPoisAlongRoute);
  const setLoading = useRouteStore((s) => s.setLoading);
  const setError = useRouteStore((s) => s.setError);

  // Calculate route when both waypoints are set
  useEffect(() => {
    if (!start || !end) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRoute(start, end)
      .then(async (result) => {
        if (cancelled) return;
        setRoute(result);

        const routeGeojson = JSON.stringify({
          type: "LineString",
          coordinates: result.coordinates,
        });

        const { data } = await supabase.rpc("pois_along_route", {
          route_geojson: routeGeojson,
          buffer_meters: 1609.34,
        });

        if (!cancelled && data) {
          setPoisAlongRoute(
            (data as Array<RoutePOI & { lng: number; lat: number }>).map((row) => ({
              id: row.id,
              title: row.title,
              description: row.description,
              category_id: row.category_id,
              is_verified: row.is_verified,
              tags: row.tags,
              color: row.color,
              lng: row.lng,
              lat: row.lat,
            }))
          );
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [start, end]);

  // Sync route line to map
  useEffect(() => {
    if (!map) return;
    setRouteSource(map, route?.coordinates ?? null);
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
