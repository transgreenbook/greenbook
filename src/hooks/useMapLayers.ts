import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { registerLayers } from "@/lib/mapLayers";

export function useMapLayers(map: maplibregl.Map | null) {
  useEffect(() => {
    if (!map) return;

    if (map.isStyleLoaded()) {
      registerLayers(map);
    } else {
      map.once("load", () => registerLayers(map));
    }
  }, [map]);
}
