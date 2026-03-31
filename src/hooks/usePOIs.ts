import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { FeatureCollection, Point } from "geojson";

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface POIProperties {
  id: number;
  title: string;
  description: string | null;
  category_id: number | null;
  is_verified: boolean;
  tags: string[] | null;
  color: string | null;
}

// Rounds bounds to 3 decimal places (~110m precision) so that small pans
// don't bust the cache and trigger a new fetch unnecessarily.
function roundBounds(b: Bounds): Bounds {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { west: r(b.west), south: r(b.south), east: r(b.east), north: r(b.north) };
}

async function fetchPOIs(bounds: Bounds): Promise<FeatureCollection<Point, POIProperties>> {
  const { data, error } = await supabase.rpc("pois_in_viewport", bounds);

  if (error) throw new Error(error.message);

  return {
    type: "FeatureCollection",
    features: (data ?? []).map((row: POIProperties & { lng: number; lat: number }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [row.lng, row.lat] },
      properties: {
        id: row.id,
        title: row.title,
        description: row.description,
        category_id: row.category_id,
        is_verified: row.is_verified,
        tags: row.tags,
        color: row.color ?? null,
      },
    })),
  };
}

export function usePOIs(bounds: Bounds | null) {
  return useQuery({
    queryKey: ["pois", bounds ? roundBounds(bounds) : null],
    queryFn: () => fetchPOIs(bounds!),
    enabled: bounds !== null,
    staleTime: 30 * 1000, // 30 seconds — POIs change infrequently
  });
}
