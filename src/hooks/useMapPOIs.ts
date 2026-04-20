import { useEffect, useState } from "react";
import type maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { usePOIs, type Bounds, type POIProperties } from "./usePOIs";

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

const EMPTY: FeatureCollection<Point, POIProperties> = { type: "FeatureCollection", features: [] };

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

    const positive: FeatureCollection<Point, POIProperties> = {
      type: "FeatureCollection",
      features: geojson.features.filter(
        (f) => f.properties.severity == null || f.properties.severity >= 0
      ),
    };
    const negative: FeatureCollection<Point, POIProperties> = {
      type: "FeatureCollection",
      features: geojson.features.filter(
        (f) => f.properties.severity != null && f.properties.severity < 0
      ),
    };

    (map.getSource("pois") as GeoJSONSource | undefined)?.setData(positive);
    (map.getSource("pois-negative") as GeoJSONSource | undefined)?.setData(negative);
  }, [map, geojson]);

  // Clear both sources when geojson is reset
  useEffect(() => {
    if (!map || geojson) return;
    (map.getSource("pois") as GeoJSONSource | undefined)?.setData(EMPTY);
    (map.getSource("pois-negative") as GeoJSONSource | undefined)?.setData(EMPTY);
  }, [map, geojson]);
}
