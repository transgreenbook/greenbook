import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/store/mapStore";

export function useMapClick(map: maplibregl.Map | null) {
  const setSelectedPOI = useMapStore((s) => s.setSelectedPOI);

  useEffect(() => {
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["pois-cluster", "pois-unclustered"],
      });

      if (!features.length) return;

      const feature = features[0];
      if (feature.geometry.type !== "Point") return;
      const center = feature.geometry.coordinates as [number, number];

      // Cluster — zoom to expand
      if (feature.properties?.cluster_id != null) {
        const source = map.getSource("pois") as maplibregl.GeoJSONSource;
        source
          .getClusterExpansionZoom(feature.properties.cluster_id)
          .then((zoom) => map.easeTo({ center, zoom: zoom + 1 }))
          .catch(() => {});
        return;
      }

      // Individual POI — open detail panel
      const p = feature.properties!;
      setSelectedPOI({
        id: p.id,
        title: p.title,
        description: p.description ?? null,
        category_id: p.category_id ?? null,
        is_verified: p.is_verified,
        tags: p.tags ? JSON.parse(p.tags) : null,
        lng: center[0],
        lat: center[1],
      });
    };

    const setCursor = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["pois-cluster", "pois-unclustered"],
      });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    };

    map.on("click", handleClick);
    map.on("mousemove", setCursor);

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", setCursor);
    };
  }, [map, setSelectedPOI]);
}
