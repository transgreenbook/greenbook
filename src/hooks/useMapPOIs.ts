import { useEffect, useState } from "react";
import type maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { usePOIs, type Bounds } from "./usePOIs";

function getBounds(map: maplibregl.Map): Bounds {
  const b = map.getBounds();
  return {
    west: b.getWest(),
    south: b.getSouth(),
    east: b.getEast(),
    north: b.getNorth(),
  };
}

// Listens to map move/zoom events, queries POIs for the current viewport,
// and keeps the "pois" GeoJSON source up to date.
export function useMapPOIs(mapRef: React.RefObject<maplibregl.Map | null>) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const { data: geojson } = usePOIs(bounds);

  // Capture initial bounds once the map loads, then update on moveend.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onLoad = () => setBounds(getBounds(map));
    const onMoveEnd = () => setBounds(getBounds(map));

    if (map.isStyleLoaded()) {
      onLoad();
    } else {
      map.once("load", onLoad);
    }

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [mapRef]);

  // Push fresh GeoJSON into the MapLibre source whenever the query resolves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    const source = map.getSource("pois") as GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [mapRef, geojson]);
}
