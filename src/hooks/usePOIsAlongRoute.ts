import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { useRouteStore } from "@/store/routeStore";
import { supabase } from "@/lib/supabase";
import type { RoutePOI } from "@/store/routeStore";

// ---------------------------------------------------------------------------
// Scale bar parsing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Geographic buffer polygon
// ---------------------------------------------------------------------------

function degToRad(d: number) { return d * Math.PI / 180; }
function radToDeg(r: number) { return r * 180 / Math.PI; }

/** Destination point given start, bearing (degrees), distance (meters). */
function destination(lng: number, lat: number, bearing: number, dist: number): [number, number] {
  const R = 6371000;
  const δ = dist / R;
  const φ1 = degToRad(lat);
  const λ1 = degToRad(lng);
  const θ = degToRad(bearing);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [radToDeg(λ2), radToDeg(φ2)];
}

/** Forward bearing from p1 to p2 (degrees). */
function segBearing(p1: [number, number], p2: [number, number]): number {
  const φ1 = degToRad(p1[1]), φ2 = degToRad(p2[1]);
  const Δλ = degToRad(p2[0] - p1[0]);
  return radToDeg(Math.atan2(Math.sin(Δλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)));
}

/**
 * Reduce a coordinate array to at most maxPoints by uniform sampling,
 * always preserving the first and last points.
 */
function simplifyCoords(coords: [number, number][], maxPoints: number): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const result: [number, number][] = [coords[0]];
  const step = (coords.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) result.push(coords[Math.round(i * step)]);
  result.push(coords[coords.length - 1]);
  return result;
}

/**
 * Build a GeoJSON buffer polygon around a LineString.
 *
 * The route is simplified to ≤60 points first so the polygon stays lightweight.
 * Intermediate vertices use round joins: an arc on the outer side of each turn
 * and a single bevel point on the inner side, eliminating miter spikes and
 * self-intersection without needing a full computational-geometry library.
 */
function computeRouteBuffer(coordsRaw: [number, number][], bufferMeters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords = simplifyCoords(coordsRaw, 60);
  const n = coords.length;
  if (n < 2) return { type: "Feature", geometry: { type: "Polygon", coordinates: [[]] }, properties: {} };

  const ARC = 8;  // arc steps per turn join
  const CAP = 12; // arc steps per end cap

  const rightRing: [number, number][] = [];
  const leftRing:  [number, number][] = [];

  for (let i = 0; i < n; i++) {
    const [x, y] = coords[i];
    const bOut = i < n - 1 ? segBearing(coords[i], coords[i + 1]) : segBearing(coords[n - 2], coords[n - 1]);
    const bIn  = i > 0     ? segBearing(coords[i - 1], coords[i]) : bOut;

    if (i === 0 || i === n - 1) {
      const b = i === 0 ? bOut : bIn;
      rightRing.push(destination(x, y, b + 90, bufferMeters));
      leftRing.push( destination(x, y, b - 90, bufferMeters));
    } else {
      let turn = bOut - bIn;
      if (turn > 180) turn -= 360;
      if (turn < -180) turn += 360;

      if (Math.abs(turn) < 5) {
        // Nearly straight — single offset point each side
        rightRing.push(destination(x, y, bIn + 90 + turn / 2, bufferMeters));
        leftRing.push( destination(x, y, bIn - 90 + turn / 2, bufferMeters));
      } else if (turn > 0) {
        // Right turn — right (outer): arc; left (inner): two-point bevel
        for (let j = 0; j <= ARC; j++)
          rightRing.push(destination(x, y, bIn + 90 + turn * j / ARC, bufferMeters));
        leftRing.push(destination(x, y, bIn - 90, bufferMeters)); // incoming inner
        leftRing.push(destination(x, y, bOut - 90, bufferMeters)); // outgoing inner
      } else {
        // Left turn — left (outer): arc; right (inner): two-point bevel
        rightRing.push(destination(x, y, bIn + 90, bufferMeters)); // incoming inner
        rightRing.push(destination(x, y, bOut + 90, bufferMeters)); // outgoing inner
        for (let j = 0; j <= ARC; j++)
          leftRing.push(destination(x, y, bIn - 90 + turn * j / ARC, bufferMeters));
      }
    }
  }

  const ring: [number, number][] = [...rightRing];

  // End cap: right tip → left tip
  const endB = segBearing(coords[n - 2], coords[n - 1]);
  for (let i = 1; i < CAP; i++)
    ring.push(destination(coords[n - 1][0], coords[n - 1][1], endB + 90 - 180 * i / CAP, bufferMeters));

  // Left side reversed
  for (let i = leftRing.length - 1; i >= 0; i--) ring.push(leftRing[i]);

  // Start cap: left tail → right tail
  const startB = segBearing(coords[0], coords[1]);
  for (let i = 1; i < CAP; i++)
    ring.push(destination(coords[0][0], coords[0][1], startB - 90 - 180 * i / CAP, bufferMeters));

  ring.push(ring[0]);
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} };
}

// ---------------------------------------------------------------------------
// Map source helpers
// ---------------------------------------------------------------------------

function setBufferSource(map: maplibregl.Map, coords: [number, number][], bufferMeters: number) {
  const source = map.getSource("route-buffer") as GeoJSONSource | undefined;
  if (!source) return;
  if (bufferMeters <= 0 || coords.length < 2) {
    source.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  source.setData(computeRouteBuffer(coords, bufferMeters));
}

function clearBufferSource(map: maplibregl.Map) {
  const source = map.getSource("route-buffer") as GeoJSONSource | undefined;
  source?.setData({ type: "FeatureCollection", features: [] });
}

// ---------------------------------------------------------------------------
// Distance label
// ---------------------------------------------------------------------------

function formatDistance(meters: number): string {
  if (meters <= 0) return "0";
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}

// ---------------------------------------------------------------------------
// POI row mapper
// ---------------------------------------------------------------------------

function dedupeById(pois: RoutePOI[]): RoutePOI[] {
  const seen = new Set<number>();
  return pois.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
}

function mapPoiRow(row: RoutePOI & { lng: number; lat: number }): RoutePOI {
  return {
    id:               row.id,
    title:            row.title,
    description:      row.description,
    long_description: null,
    category_id:      row.category_id,
    is_verified:      row.is_verified,
    tags:             row.tags,
    color:            row.color,
    icon:             row.icon ?? null,
    severity:         row.severity ?? null,
    lng:              row.lng,
    lat:              row.lat,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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

      setBaseBufferMeters(rawMeters);
      setMidLat(routeMidLat);

      const multiplier = useRouteStore.getState().bufferMultiplier;
      const actualMeters = rawMeters * multiplier / 100;

      console.log("[route POI search] scale →", rawMeters, "m; ×", multiplier, "% =", actualMeters, "m");

      setBufferSource(map, coords, actualMeters);

      const routeGeojson = JSON.stringify({ type: "LineString", coordinates: coords });
      const { data, error } = await supabase.rpc("pois_along_route", {
        route_geojson: routeGeojson,
        buffer_meters: actualMeters,
      });

      if (!cancelled) {
        if (error) setError(error.message);
        if (data) {
          setPoisAlongRoute(dedupeById((data as Array<RoutePOI & { lng: number; lat: number }>).map(mapPoiRow)));
          setRouteBuffer(formatDistance(actualMeters));
        }
        setLoading(false);
      }
    };

    map.once("moveend", onMoveEnd);
    return () => {
      cancelled = true;
      map.off("moveend", onMoveEnd);
      clearBufferSource(map);
      setBaseBufferMeters(null);
      setMidLat(null);
    };
  }, [map, route]);

  // Effect 2: fires when the buffer slider moves.
  // Immediately redraws the polygon; debounces the DB re-query.
  useEffect(() => {
    const { baseBufferMeters, route: currentRoute } = useRouteStore.getState();
    if (!map || baseBufferMeters === null || !currentRoute) return;

    const actualMeters = baseBufferMeters * bufferMultiplier / 100;
    setBufferSource(map, currentRoute.coordinates, actualMeters);

    const timer = setTimeout(async () => {
      const routeGeojson = JSON.stringify({ type: "LineString", coordinates: currentRoute.coordinates });
      const { data, error } = await supabase.rpc("pois_along_route", {
        route_geojson: routeGeojson,
        buffer_meters: actualMeters,
      });
      if (error) setError(error.message);
      if (data) {
        setPoisAlongRoute(dedupeById((data as Array<RoutePOI & { lng: number; lat: number }>).map(mapPoiRow)));
        setRouteBuffer(formatDistance(actualMeters));
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [map, bufferMultiplier]);
}
