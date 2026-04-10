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

// Converts a geographic buffer distance (meters) to a MapLibre zoom-based
// line-width expression so the rendered stroke matches the geographic radius.
// Uses exponential-2 interpolation which mirrors MapLibre's tile-zoom doubling.
function bufferWidthExpression(bufferMeters: number, midLat: number): maplibregl.ExpressionSpecification {
  // At zoom 0, one pixel = 156543 m at the equator, scaled by cos(lat)
  const metersPerPixelZoom0 = 156543.03392 * Math.cos((midLat * Math.PI) / 180);
  const widthAtZoom0 = (bufferMeters * 2) / metersPerPixelZoom0;
  return ["interpolate", ["exponential", 2], ["zoom"], 0, widthAtZoom0, 24, widthAtZoom0 * Math.pow(2, 24)];
}

export function usePOIsAlongRoute(map: maplibregl.Map | null) {
  const route             = useRouteStore((s) => s.route);
  const setPoisAlongRoute = useRouteStore((s) => s.setPoisAlongRoute);
  const setRouteBuffer    = useRouteStore((s) => s.setRouteBuffer);
  const setLoading        = useRouteStore((s) => s.setLoading);
  const setError          = useRouteStore((s) => s.setError);

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
      const { meters: bufferMeters, label: bufferLabel } = parseScaleBar(scaleEl);

      console.log("[route POI search] scale bar text:", scaleEl?.textContent, "→ bufferMeters:", bufferMeters);

      const midLat = coords[Math.floor(coords.length / 2)][1];
      map.setPaintProperty("route-buffer", "line-width", bufferWidthExpression(bufferMeters, midLat));

      const routeGeojson = JSON.stringify({ type: "LineString", coordinates: coords });
      const { data, error } = await supabase.rpc("pois_along_route", {
        route_geojson: routeGeojson,
        buffer_meters: bufferMeters,
      });

      console.log("[route POI search] results:", data?.length ?? 0, "error:", error?.message ?? null);

      if (!cancelled) {
        if (error) setError(error.message);
        if (data) {
          setPoisAlongRoute(
            (data as Array<RoutePOI & { lng: number; lat: number }>).map((row) => ({
              id:          row.id,
              title:       row.title,
              description: row.description,
              category_id: row.category_id,
              is_verified: row.is_verified,
              tags:        row.tags,
              color:       row.color,
              icon:        row.icon ?? null,
              lng:         row.lng,
              lat:         row.lat,
            }))
          );
          setRouteBuffer(bufferLabel);
        }
        setLoading(false);
      }
    };

    map.once("moveend", onMoveEnd);
    return () => {
      cancelled = true;
      map.off("moveend", onMoveEnd);
      map.setPaintProperty("route-buffer", "line-width", 0);
    };
  }, [map, route]);
}
