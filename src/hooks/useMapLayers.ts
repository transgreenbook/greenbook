import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { registerLayers } from "@/lib/mapLayers";

// Registers all zoom-based layers once the map style is fully loaded.
// Safe to call on every render — MapLibre's getSource/getLayer guards
// in registerLayers prevent duplicate registration.
export function useMapLayers(mapRef: React.RefObject<maplibregl.Map | null>) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      registerLayers(map);
    } else {
      map.once("load", () => registerLayers(map));
    }
  }, [mapRef]);
}
