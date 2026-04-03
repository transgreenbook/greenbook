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
    zoom: map.getZoom(),
  };
}

export function useMapPOIs(map: maplibregl.Map | null) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const { data: geojson } = usePOIs(bounds);

  useEffect(() => {
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
  }, [map]);

  useEffect(() => {
    if (!map || !geojson) return;
    const source = map.getSource("pois") as GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [map, geojson]);
}
