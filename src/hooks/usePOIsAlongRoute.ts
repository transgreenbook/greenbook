import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useRouteStore } from "@/store/routeStore";
import { supabase } from "@/lib/supabase";
import type { RoutePOI } from "@/store/routeStore";

function parseScaleBar(el: HTMLElement | null): { meters: number; label: string } {
  const fallback = { meters: 1609.344, label: "1 mi" };
  if (!el) return fallback;
  const text = (el.textContent ?? "").trim();
  const match = text.match(/^([\d,]+)\s*(mi|km|m|ft)$/);
  if (!match) return fallback;
  const value = parseFloat(match[1].replace(/,/g, ""));
  const unit = match[2];
  let meters: number;
  if      (unit === "mi") meters = value * 1609.344;
  else if (unit === "km") meters = value * 1000;
  else if (unit === "m")  meters = value;
  else if (unit === "ft") meters = value * 0.3048;
  else return fallback;
  return { meters, label: text };
}

function bufferWidthExpression(bufferMeters: number, midLat: number): maplibregl.ExpressionSpecification {
  const metersPerPixelZoom0 = 156543.03392 * Math.cos((midLat * Math.PI) / 180);
  const widthAtZoom0 = (bufferMeters * 2) / metersPerPixelZoom0;
  return ["interpolate", ["exponential", 2], ["zoom"], 0, widthAtZoom0, 24, widthAtZoom0 * Math.pow(2, 24)];
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}

function mapPoiRow(row: RoutePOI & { lng: number; lat: number }): RoutePOI {
  return {
    id:          row.id,
    title:       row.title,
    description: row.description,
    long_description: null, // not returned by pois_along_route RPC
    category_id: row.category_id,
    is_verified: row.is_verified,
    tags:        row.tags,
    color:       row.color,
    icon:        row.icon ?? null,
    lng:         row.lng,
    lat:         row.lat,
  };
}

export function usePOIsAlongRoute(map: maplibregl.Map | null) {
  const route               = useRouteStore((s) => s.route);
  const bufferMultiplier    = useRouteStore((s) => s.bufferMultiplier);
  const setPoisAlongRoute   = useRouteStore((s) => s.setPoisAlongRoute);
  const setRouteBuffer      = useRouteStore((s) => s.setRouteBuffer);
  const setBaseBufferMeters = useRouteStore((s) => s.setBaseBufferMeters);
  const setMidLat           = useRouteStore((s) => s.setMidLat);
  const setLoading          = useRouteStore((s) => s.setLoading);
  const setError            = useRouteStore((s) => s.setError);

  // Effect 1: fires when the route changes.
  // Fits the map, waits for the animation, reads the scale bar, then fetches POIs.
  useEffect(() => {
    if (!map || !route) return;
    let cancelled = false;

    const coords = route.coordinates;
    const lngs = coords.map(([lng]) => lng);
    const lats = coords.map(([, lat]) => lat);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 800 }
    );

    const onMoveEnd = async () => {
      if (cancelled) return;

      const scaleEl = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-scale");
      const { meters: rawMeters } = parseScaleBar(scaleEl);
      const routeMidLat = coords[Math.floor(coords.length / 2)][1];

      // Store so Effect 2 can react to slider changes
      setBaseBufferMeters(rawMeters);
      setMidLat(routeMidLat);

      const multiplier = useRouteStore.getState().bufferMultiplier;
      const actualMeters = rawMeters * multiplier / 100;

      console.log("[route POI search] scale bar →", rawMeters, "m; multiplier:", multiplier, "%; actual:", actualMeters, "m");

      map.setPaintProperty("route-buffer", "line-width", bufferWidthExpression(actualMeters, routeMidLat));

      const routeGeojson = JSON.stringify({ type: "LineString", coordinates: coords });
      const { data, error } = await supabase.rpc("pois_along_route", {
        route_geojson: routeGeojson,
        buffer_meters: actualMeters,
      });

      if (!cancelled) {
        if (error) setError(error.message);
        if (data) {
          setPoisAlongRoute((data as Array<RoutePOI & { lng: number; lat: number }>).map(mapPoiRow));
          setRouteBuffer(formatDistance(actualMeters));
        }
        setLoading(false);
      }
    };

    map.once("moveend", onMoveEnd);
    return () => {
      cancelled = true;
      map.off("moveend", onMoveEnd);
      map.setPaintProperty("route-buffer", "line-width", 0);
      setBaseBufferMeters(null);
      setMidLat(null);
    };
  }, [map, route]);

  // Effect 2: fires when the buffer slider moves.
  // Immediately updates the visual; debounces the DB re-query.
  useEffect(() => {
    const { baseBufferMeters, midLat, route: currentRoute } = useRouteStore.getState();
    if (!map || baseBufferMeters === null || midLat === null || !currentRoute) return;

    const actualMeters = baseBufferMeters * bufferMultiplier / 100;
    map.setPaintProperty("route-buffer", "line-width", bufferWidthExpression(actualMeters, midLat));

    const timer = setTimeout(async () => {
      const routeGeojson = JSON.stringify({ type: "LineString", coordinates: currentRoute.coordinates });
      const { data, error } = await supabase.rpc("pois_along_route", {
        route_geojson: routeGeojson,
        buffer_meters: actualMeters,
      });
      if (error) setError(error.message);
      if (data) {
        setPoisAlongRoute((data as Array<RoutePOI & { lng: number; lat: number }>).map(mapPoiRow));
        setRouteBuffer(formatDistance(actualMeters));
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [map, bufferMultiplier]);
}
