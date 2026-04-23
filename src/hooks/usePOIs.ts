import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { boundsKey, cachePOIs, getCachedPOIs } from "@/lib/poiCache";
import type { FeatureCollection, Point } from "geojson";

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}

export interface POIProperties {
  id: number;
  title: string;
  description: string | null;
  long_description: string | null;
  category_id: number | null;
  is_verified: boolean;
  tags: string[] | null;
  color: string | null;
  icon: string | null;
  severity?: number | null;
}

// Rounds bounds to 3 decimal places (~110m precision) so that small pans
// don't bust the cache and trigger a new fetch unnecessarily.
function roundBounds(b: Bounds): Bounds {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { west: r(b.west), south: r(b.south), east: r(b.east), north: r(b.north), zoom: Math.round(b.zoom * 10) / 10 };
}

async function fetchPOIs(bounds: Bounds): Promise<FeatureCollection<Point, POIProperties>> {
  const rounded = roundBounds(bounds);
  const key = boundsKey(rounded);

  try {
    const { data, error } = await supabase.rpc("pois_in_viewport", { ...rounded, zoom: rounded.zoom });
    if (error) throw new Error(error.message);

    const geojson: FeatureCollection<Point, POIProperties> = {
      type: "FeatureCollection",
      features: (data ?? []).map((row: POIProperties & { lng: number; lat: number }) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [row.lng, row.lat] },
        properties: {
          id: row.id,
          title: row.title,
          description: row.description,
          long_description: row.long_description ?? null,
          category_id: row.category_id,
          is_verified: row.is_verified,
          tags: row.tags,
          color: row.color ?? null,
          icon: row.icon ?? null,
          severity: row.severity ?? null,
        },
      })),
    };

    // Write to IndexedDB for offline use
    cachePOIs(key, geojson);
    return geojson;
  } catch (err) {
    // Network failure — try IndexedDB fallback
    const cached = await getCachedPOIs(key);
    if (cached) return cached;
    throw err;
  }
}

export function usePOIs(bounds: Bounds | null) {
  return useQuery({
    queryKey: ["pois", bounds ? roundBounds(bounds) : null],
    queryFn: () => fetchPOIs(bounds!),
    enabled: bounds !== null,
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — POI data changes at most once or twice a day
    gcTime:   8 * 60 * 60 * 1000, // keep in memory cache for 8 hours
  });
}
