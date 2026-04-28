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


async function fetchRegionPOIs(region: SelectedRegion): Promise<RegionPOI[]> {
  if (region.type === "state") {
    const { data, error } = await supabase.rpc("pois_in_state", { p_abbr: region.stateAbbr });
    if (error) throw new Error(error.message);
    return (data ?? []).sort((a: RegionPOI, b: RegionPOI) => Math.abs(b.severity ?? 0) - Math.abs(a.severity ?? 0));
  }

  if (region.type === "county") {
    const { data, error } = await supabase.rpc("pois_in_county", { p_fips: region.fips5 });
    if (error) throw new Error(error.message);
    return (data ?? []).sort((a: RegionPOI, b: RegionPOI) => Math.abs(b.severity ?? 0) - Math.abs(a.severity ?? 0));
  }

  if (region.type === "reservation") {
    const { data, error } = await supabase.rpc("pois_in_reservation", { p_geoid: region.geoid });
    if (error) throw new Error(error.message);
    return (data ?? []).sort((a: RegionPOI, b: RegionPOI) => Math.abs(b.severity ?? 0) - Math.abs(a.severity ?? 0));
  }

  // city
  const { data, error } = await supabase.rpc("pois_in_city", { p_city_name: region.name, p_statefp: region.statefp });
  if (error) throw new Error(error.message);
  return (data ?? []).sort((a: RegionPOI, b: RegionPOI) => Math.abs(b.severity ?? 0) - Math.abs(a.severity ?? 0));
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
