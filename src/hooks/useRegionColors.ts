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
// STUSPS → STATEFP lookup (50 states + DC)
// Territories (AS=60, GU=66, MP=69, PR=72, VI=78) are intentionally excluded —
// they have no parent state and should not inherit state colors.
// ---------------------------------------------------------------------------

const STATE_FIPS: Record<string, string> = {
  AL:'01', AK:'02', AZ:'04', AR:'05', CA:'06', CO:'08', CT:'09', DE:'10',
  DC:'11', FL:'12', GA:'13', HI:'15', ID:'16', IL:'17', IN:'18', IA:'19',
  KS:'20', KY:'21', LA:'22', ME:'23', MD:'24', MA:'25', MI:'26', MN:'27',
  MS:'28', MO:'29', MT:'30', NE:'31', NV:'32', NH:'33', NJ:'34', NM:'35',
  NY:'36', NC:'37', ND:'38', OH:'39', OK:'40', OR:'41', PA:'42', RI:'44',
  SC:'45', SD:'46', TN:'47', TX:'48', UT:'49', VT:'50', VA:'51', WA:'53',
  WV:'54', WI:'55', WY:'56',
};

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

// Halve the opacity of an hsla() color string for use as inherited state tint.
function halfOpacity(color: string): string {
  const m = color.match(/^hsla\(([^,]+),([^,]+),([^,]+),([\d.]+)\)$/);
  if (!m) return color;
  return `hsla(${m[1]},${m[2]},${m[3]},${(parseFloat(m[4]) / 2).toFixed(2)})`;
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

      // Sort ascending by severity magnitude so the most severe POI is
      // processed last and wins when multiple laws share the same region.
      const bySeverity = (a: RegionPOI, b: RegionPOI) =>
        Math.abs(a.severity ?? 0) - Math.abs(b.severity ?? 0);

      const statePOIs  = (pois as RegionPOI[]).filter((p) => p.effect_scope === "state").sort(bySeverity);
      const countyPOIs = (pois as RegionPOI[]).filter((p) => p.effect_scope === "county").sort(bySeverity);
      const cityPOIs   = (pois as RegionPOI[]).filter((p) => p.effect_scope === "city").sort(bySeverity);

      // ── States ────────────────────────────────────────────────────────
      // Track state colors so we can propagate them to counties and cities.
      const stateColorByAbbr: Record<string, string> = {};

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
            stateColorByAbbr[c.abbr] = color;
            mapRef.setFeatureState(
              { source: "states", sourceLayer: "states", id: c.abbr },
              { severity_color: color },
            );
          }
        }
      }

      // ── Propagate state color → counties and cities ───────────────────
      // Counties/cities with no own severity show a 50%-opacity tint of
      // their parent state's color instead of fading to neutral.
      // Reservations are a separate source/layer and are unaffected.
      // Territories (PR, GU, etc.) are excluded from STATE_FIPS and inherit nothing.
      if (Object.keys(stateColorByAbbr).length > 0) {
        // Build STATEFP → faded color map
        const fadedByFp: Record<string, string> = {};
        for (const [abbr, color] of Object.entries(stateColorByAbbr)) {
          const fp = STATE_FIPS[abbr];
          if (fp) fadedByFp[fp] = halfOpacity(color);
        }

        // Fetch county and city centroids in parallel (browser-cached after first load)
        const [countyGeo, cityGeo] = await Promise.all([
          fetch("/county-centroids.geojson").then((r) => r.json()),
          fetch("/city-centroids.geojson").then((r) => r.json()),
        ]);

        for (const f of countyGeo.features as { properties: { STATEFP: string; COUNTYFP: string } }[]) {
          const color = fadedByFp[f.properties.STATEFP];
          if (color) {
            mapRef.setFeatureState(
              { source: "counties", sourceLayer: "counties", id: f.properties.STATEFP + f.properties.COUNTYFP },
              { state_color: color },
            );
          }
        }

        for (const f of cityGeo.features as { properties: { STATEFP: string; PLACEFP: string } }[]) {
          const color = fadedByFp[f.properties.STATEFP];
          if (color) {
            mapRef.setFeatureState(
              { source: "places", sourceLayer: "places", id: f.properties.PLACEFP },
              { state_color: color },
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
