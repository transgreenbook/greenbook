export interface GeocodingResult {
  label: string;
  name: string;   // primary feature name, used for prefix-match sorting
  lng: number;
  lat: number;
}

export async function geocode(
  query: string,
  signal?: AbortSignal
): Promise<GeocodingResult[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=-180,18,-60,72`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.features ?? []).map(
    (f: {
      geometry: { coordinates: [number, number] };
      properties: { name?: string; city?: string; state?: string; country?: string };
    }) => {
      const p = f.properties;
      const name = p.name ?? p.city ?? "";
      const parts = [p.name, p.city !== p.name ? p.city : null, p.state].filter(Boolean);
      return {
        label: parts.join(", ") || p.country || "Unknown place",
        name,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      };
    }
  );
}
