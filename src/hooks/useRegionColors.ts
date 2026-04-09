import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RegionPOI = {
  id: number;
  title: string;
  effect_scope: string;
  severity: number | null;
  color: string | null;
  lat: number;
  lng: number;
};

type LatLng = { lat: number; lng: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nearest<T extends LatLng>(items: T[], lat: number, lng: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const d = (item.lat - lat) ** 2 + (item.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = item; }
  }
  return best;
}

// Map a severity value to an hsla fill color.
// Negative severity → red-orange spectrum (danger/warning).
// Positive severity → green spectrum (affirming/safe).
function severityColor(severity: number | null, poiColor: string | null): string | null {
  if (poiColor) return poiColor;
  if (!severity) return null;
  const intensity = Math.abs(severity) / 10;
  const opacity   = (0.15 + intensity * 0.5).toFixed(2);
  return severity < 0
    ? `hsla(10, 85%, 50%, ${opacity})`   // red-orange
    : `hsla(120, 70%, 40%, ${opacity})`; // green
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRegionColors(map: maplibregl.Map | null) {
  useEffect(() => {
    if (!map) return;

    const mapRef = map;

    async function apply() {
      const { data: pois, error } = await supabase.rpc("get_region_scoped_pois");
      if (error || !pois?.length) return;

      const statePOIs  = (pois as RegionPOI[]).filter((p) => p.effect_scope === "state");
      const countyPOIs = (pois as RegionPOI[]).filter((p) => p.effect_scope === "county");
      const cityPOIs   = (pois as RegionPOI[]).filter((p) => p.effect_scope === "city");

      // ── States ────────────────────────────────────────────────────────
      if (statePOIs.length) {
        const geo = await fetch("/state-centroids.geojson").then((r) => r.json());
        const centroids = (geo.features as { properties: { STUSPS: string }; geometry: { coordinates: [number, number] } }[])
          .map((f) => ({
            abbr: f.properties.STUSPS,
            lat:  f.geometry.coordinates[1],
            lng:  f.geometry.coordinates[0],
          }));

        for (const poi of statePOIs) {
          const c = nearest(centroids, poi.lat, poi.lng);
          if (!c) continue;
          const color = severityColor(poi.severity, poi.color);
          if (color) {
            mapRef.setFeatureState(
              { source: "states", sourceLayer: "states", id: c.abbr },
              { severity_color: color },
            );
          }
        }
      }

      // ── Cities ────────────────────────────────────────────────────────
      if (cityPOIs.length) {
        const geo = await fetch("/city-centroids.geojson").then((r) => r.json());
        const centroids = (geo.features as { properties: { NAME: string; STATEFP: string; PLACEFP: string }; geometry: { coordinates: [number, number] } }[])
          .map((f) => ({
            placefp: f.properties.PLACEFP,
            lat:     f.geometry.coordinates[1],
            lng:     f.geometry.coordinates[0],
          }));

        for (const poi of cityPOIs) {
          const c = nearest(centroids, poi.lat, poi.lng);
          if (!c) continue;
          const color = severityColor(poi.severity, poi.color);
          if (color) {
            mapRef.setFeatureState(
              { source: "places", sourceLayer: "places", id: c.placefp },
              { severity_color: color },
            );
          }
        }
      }

      // ── Counties ──────────────────────────────────────────────────────
      if (countyPOIs.length) {
        const geo = await fetch("/county-centroids.geojson").then((r) => r.json());
        const centroids = (geo.features as { properties: { STATEFP: string; COUNTYFP: string }; geometry: { coordinates: [number, number] } }[])
          .map((f) => ({
            geoid: f.properties.STATEFP + f.properties.COUNTYFP,
            lat:   f.geometry.coordinates[1],
            lng:   f.geometry.coordinates[0],
          }));

        for (const poi of countyPOIs) {
          const c = nearest(centroids, poi.lat, poi.lng);
          if (!c) continue;
          const color = severityColor(poi.severity, poi.color);
          if (color) {
            mapRef.setFeatureState(
              { source: "counties", sourceLayer: "counties", id: c.geoid },
              { severity_color: color },
            );
          }
        }
      }
    }

    if (mapRef.isStyleLoaded()) {
      apply();
    } else {
      mapRef.once("load", apply);
    }
  }, [map]);
}
