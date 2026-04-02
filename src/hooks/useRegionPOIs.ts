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
  let result;

  if (region.type === "state") {
    result = await supabase.rpc("pois_in_state", { state_abbr: region.stateAbbr });
  } else if (region.type === "county") {
    result = await supabase.rpc("pois_in_county", { fips_code: region.fips5 });
  } else {
    result = await supabase.rpc("pois_in_city", {
      city_name: region.name,
      statefp: region.statefp,
    });
  }

  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

function regionQueryKey(region: SelectedRegion): unknown[] {
  if (region.type === "state") return ["region-pois", "state", region.stateAbbr];
  if (region.type === "county") return ["region-pois", "county", region.fips5];
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
