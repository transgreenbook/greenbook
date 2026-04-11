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

// Maps Census STATEFP (2-digit string) → state abbreviation.
// Used to resolve parent-state POIs when a county or city is selected.
const STATEFP_TO_ABBR: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
  "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
  "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
  "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
};

function mergeAndSort(primary: RegionPOI[], ...parents: (RegionPOI[] | null)[]): RegionPOI[] {
  const seen = new Set<number>();
  const result: RegionPOI[] = [];
  for (const p of [...primary, ...parents.flat().filter(Boolean) as RegionPOI[]]) {
    if (!seen.has(p.id)) { seen.add(p.id); result.push(p); }
  }
  return result.sort((a, b) => (a.severity ?? 0) - (b.severity ?? 0));
}

async function fetchRegionPOIs(region: SelectedRegion): Promise<RegionPOI[]> {
  if (region.type === "state") {
    const { data, error } = await supabase.rpc("pois_in_state", { p_abbr: region.stateAbbr });
    if (error) throw new Error(error.message);
    return (data ?? []).sort((a: RegionPOI, b: RegionPOI) => (a.severity ?? 0) - (b.severity ?? 0));
  }

  if (region.type === "county") {
    const stateAbbr = STATEFP_TO_ABBR[region.fips5!.slice(0, 2)];
    const [countyResult, stateResult] = await Promise.all([
      supabase.rpc("pois_in_county", { p_fips: region.fips5 }),
      stateAbbr
        ? supabase.rpc("pois_in_state", { p_abbr: stateAbbr })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (countyResult.error) throw new Error(countyResult.error.message);
    return mergeAndSort(countyResult.data ?? [], stateResult.data);
  }

  // city
  const stateAbbr = STATEFP_TO_ABBR[region.statefp!];
  const [cityResult, stateResult] = await Promise.all([
    supabase.rpc("pois_in_city", { p_city_name: region.name, p_statefp: region.statefp }),
    stateAbbr
      ? supabase.rpc("pois_in_state", { p_abbr: stateAbbr })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cityResult.error) throw new Error(cityResult.error.message);
  return mergeAndSort(cityResult.data ?? [], stateResult.data);
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
