import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SelectedRegion } from "@/store/mapStore";

export interface RegionPOI {
  id: number;
  title: string;
  description: string | null;
  category_id: number | null;
  is_verified: boolean;
  tags: string[] | null;
  lng: number;
  lat: number;
  color: string | null;
  severity: number;
  icon: string | null;
}

function sortBySeverity(rows: RegionPOI[]): RegionPOI[] {
  return rows.sort((a, b) => Math.abs(b.severity ?? 0) - Math.abs(a.severity ?? 0));
}

// Merge two POI arrays, deduplicating by id.
function merge(primary: RegionPOI[], secondary: RegionPOI[]): RegionPOI[] {
  const seen = new Set(primary.map((p) => p.id));
  return sortBySeverity([...primary, ...secondary.filter((p) => !seen.has(p.id))]);
}

// Fetch point-scoped POIs within a bounding box using pois_in_bbox, which
// reliably uses ST_Within against a bbox parameter (no DB geometry columns needed).
async function fetchPointPoisInBounds(
  bounds: [[number, number], [number, number]],
): Promise<RegionPOI[]> {
  const [[west, south], [east, north]] = bounds;
  const { data, error } = await supabase.rpc("pois_in_bbox", {
    west, south, east, north,
  });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((p: RegionPOI & { effect_scope: string }) => p.effect_scope === "point")
    .map((p: RegionPOI & { effect_scope: string }) => ({
      id: p.id, title: p.title, description: p.description,
      category_id: p.category_id, is_verified: p.is_verified, tags: p.tags,
      lng: p.lng, lat: p.lat, color: p.color, severity: p.severity, icon: p.icon,
    }));
}

async function fetchStatePois(stateAbbr: string | undefined): Promise<RegionPOI[]> {
  if (!stateAbbr) return [];
  const { data, error } = await supabase.rpc("pois_in_state", { p_abbr: stateAbbr });
  if (error) throw new Error(error.message);
  return sortBySeverity(data ?? []);
}

async function fetchRegionPOIs(region: SelectedRegion): Promise<RegionPOI[]> {
  if (region.type === "state") {
    return fetchStatePois(region.stateAbbr);
  }

  if (region.type === "county") {
    const [scopedResult, pointPois, statePois] = await Promise.all([
      supabase.rpc("pois_in_county", { p_fips: region.fips5 }),
      region.bounds ? fetchPointPoisInBounds(region.bounds) : Promise.resolve([]),
      fetchStatePois(region.stateAbbr),
    ]);
    if (scopedResult.error) throw new Error(scopedResult.error.message);
    return merge(merge(scopedResult.data ?? [], pointPois), statePois);
  }

  if (region.type === "reservation") {
    const { data, error } = await supabase.rpc("pois_in_reservation", { p_geoid: region.geoid });
    if (error) throw new Error(error.message);
    return sortBySeverity(data ?? []);
  }

  // city
  const [scopedResult, pointPois, statePois] = await Promise.all([
    supabase.rpc("pois_in_city", { p_city_name: region.name, p_statefp: region.statefp }),
    region.bounds ? fetchPointPoisInBounds(region.bounds) : Promise.resolve([]),
    fetchStatePois(region.stateAbbr),
  ]);
  if (scopedResult.error) throw new Error(scopedResult.error.message);
  return merge(merge(scopedResult.data ?? [], pointPois), statePois);
}

function regionQueryKey(region: SelectedRegion): unknown[] {
  if (region.type === "state")       return ["region-pois", "state", region.stateAbbr];
  if (region.type === "county")      return ["region-pois", "county", region.fips5];
  if (region.type === "reservation") return ["region-pois", "reservation", region.geoid];
  return ["region-pois", "city", region.name, region.statefp];
}

export function useRegionPOIs(region: SelectedRegion | null) {
  return useQuery({
    queryKey: region ? regionQueryKey(region) : ["region-pois", null],
    queryFn: () => fetchRegionPOIs(region!),
    enabled: region !== null,
    staleTime: 60 * 1000,
  });
}
