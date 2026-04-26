import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  severity_weight: number;
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
// severity_weight (0–100) scales the final opacity so low-weight categories
// appear dim even at full severity (e.g. weight=25 → 25% as bright).
function severityColor(severity: number | null, poiColor: string | null, weight = 100): string | null {
  if (poiColor) return poiColor;
  if (!severity || weight === 0) return null;
  const intensity   = Math.abs(severity) / 10;
  const baseOpacity = 0.15 + intensity * 0.5;
  const opacity     = (baseOpacity * (weight / 100)).toFixed(2);
  return severity < 0
    ? `hsla(10, 85%, 50%, ${opacity})`   // red-orange
    : `hsla(120, 70%, 40%, ${opacity})`; // green
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRegionColors(map: maplibregl.Map | null) {
  // Region-scoped POIs are fetched once and cached for 4 hours. This dataset
  // covers all state/county/city coloring and changes at most once or twice a
  // day, so there is no value in re-fetching it on every page load.
  const { data: regionPOIs } = useQuery({
    queryKey: ["region-scoped-pois"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_region_scoped_pois");
      if (error) throw new Error(error.message);
      return (data ?? []) as RegionPOI[];
    },
    staleTime: 4 * 60 * 60 * 1000, // 4 hours
    gcTime:    8 * 60 * 60 * 1000, // keep in memory 8 hours
  });

  useEffect(() => {
    if (!map || !regionPOIs?.length) return;

    const mapRef = map;

    async function apply() {
      // Wait until our custom sources (added by registerLayers) are actually
      // registered. isStyleLoaded() only confirms the base Stadia style is ready;
      // our programmatic sources may not exist yet (e.g. React Query cache is warm
      // but the map hasn't finished initialising). Defer to "idle" and retry once.
      if (!mapRef.getSource("states") || !mapRef.getSource("counties") || !mapRef.getSource("places")) {
        mapRef.once("idle", apply);
        return;
      }

      // Sort ascending by dominance (|severity| × weight) so the most dominant
      // POI is processed last and wins when multiple POIs share the same region.
      const byDominance = (a: RegionPOI, b: RegionPOI) =>
        Math.abs(a.severity ?? 0) * a.severity_weight - Math.abs(b.severity ?? 0) * b.severity_weight;

      const allState  = regionPOIs.filter((p) => p.effect_scope === "state");
      const allCounty = regionPOIs.filter((p) => p.effect_scope === "county");
      const allCity   = regionPOIs.filter((p) => p.effect_scope === "city");

      // Split into negative (danger) and positive (affirming) — each renders
      // its own fill layer so both signals can be visible simultaneously.
      const statePOIs          = allState.filter((p)  => (p.severity ?? 0) < 0).sort(byDominance);
      const statePositivePOIs  = allState.filter((p)  => (p.severity ?? 0) > 0).sort(byDominance);
      const countyPOIs         = allCounty.filter((p) => (p.severity ?? 0) < 0).sort(byDominance);
      const countyPositivePOIs = allCounty.filter((p) => (p.severity ?? 0) > 0).sort(byDominance);
      const cityPOIs           = allCity.filter((p)   => (p.severity ?? 0) < 0).sort(byDominance);
      const cityPositivePOIs   = allCity.filter((p)   => (p.severity ?? 0) > 0).sort(byDominance);

      // ── States ────────────────────────────────────────────────────────
      if (statePOIs.length || statePositivePOIs.length) {
        const geo = await fetch("/state-centroids.geojson", { cache: "no-cache" }).then((r) => r.json());
        const centroids = (geo.features as { properties: { STUSPS: string }; geometry: { coordinates: [number, number] } }[])
          .map((f) => ({
            abbr: f.properties.STUSPS,
            lat:  f.geometry.coordinates[1],
            lng:  f.geometry.coordinates[0],
          }));

        for (const poi of statePOIs) {
          const c = nearest(centroids, poi.lat, poi.lng);
          if (!c) continue;
          const color = severityColor(poi.severity, poi.color, poi.severity_weight);
          if (color) mapRef.setFeatureState(
            { source: "states", sourceLayer: "states", id: c.abbr },
            { severity_color: color },
          );
        }
        for (const poi of statePositivePOIs) {
          const c = nearest(centroids, poi.lat, poi.lng);
          if (!c) continue;
          const color = severityColor(poi.severity, poi.color, poi.severity_weight);
          if (color) mapRef.setFeatureState(
            { source: "states", sourceLayer: "states", id: c.abbr },
            { positive_color: color },
          );
        }
      }

      // ── Cities ────────────────────────────────────────────────────────
      if (cityPOIs.length || cityPositivePOIs.length) {
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
          const color = severityColor(poi.severity, poi.color, poi.severity_weight);
          if (color) mapRef.setFeatureState(
            { source: "places", sourceLayer: "places", id: c.placefp },
            { severity_color: color },
          );
        }
        for (const poi of cityPositivePOIs) {
          const c = nearest(centroids, poi.lat, poi.lng);
          if (!c) continue;
          const color = severityColor(poi.severity, poi.color, poi.severity_weight);
          if (color) mapRef.setFeatureState(
            { source: "places", sourceLayer: "places", id: c.placefp },
            { positive_color: color },
          );
        }
      }

      // ── Counties ──────────────────────────────────────────────────────
      if (countyPOIs.length || countyPositivePOIs.length) {
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
          const color = severityColor(poi.severity, poi.color, poi.severity_weight);
          if (color) mapRef.setFeatureState(
            { source: "counties", sourceLayer: "counties", id: c.geoid },
            { severity_color: color },
          );
        }
        for (const poi of countyPositivePOIs) {
          const c = nearest(centroids, poi.lat, poi.lng);
          if (!c) continue;
          const color = severityColor(poi.severity, poi.color, poi.severity_weight);
          if (color) mapRef.setFeatureState(
            { source: "counties", sourceLayer: "counties", id: c.geoid },
            { positive_color: color },
          );
        }
      }
    }

    if (mapRef.isStyleLoaded()) {
      apply();
    } else {
      mapRef.once("load", apply);
    }
  }, [map, regionPOIs]);
}
