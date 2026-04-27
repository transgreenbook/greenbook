export interface RouteWaypoint {
  lng: number;
  lat: number;
  label: string;
}

export interface RouteResult {
  coordinates: [number, number][]; // [lng, lat] pairs — GeoJSON order
  distanceMiles: number;
}

// Decode Valhalla's precision-6 encoded polyline.
// Valhalla encodes as [lat, lng] pairs; we swap to [lng, lat] for GeoJSON.
function decodePolyline(encoded: string): [number, number][] {
  const factor = 1e6;
  const coords: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / factor, lat / factor]);
  }

  return coords;
}

export async function fetchRoute(
  start: RouteWaypoint,
  end: RouteWaypoint
): Promise<RouteResult> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const res = await fetch(`${basePath}/api/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: [
        { lon: start.lng, lat: start.lat, type: "break" },
        { lon: end.lng, lat: end.lat, type: "break" },
      ],
      costing: "auto",
      directions_options: { units: "miles" },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg: string = data.error ?? "";
    if (msg.toLowerCase().includes("max distance") || msg.toLowerCase().includes("exceeds"))
      throw new Error("Route too long — the free routing service has a ~930 mile limit. Try a shorter trip.");
    throw new Error(msg || "Routing request failed — check your start and end points.");
  }

  return {
    coordinates: decodePolyline(data.trip.legs[0].shape),
    distanceMiles: data.trip.summary.length,
  };
}
