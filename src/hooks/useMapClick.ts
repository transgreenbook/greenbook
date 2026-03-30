import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/store/mapStore";

export function useMapClick(map: maplibregl.Map | null) {
  const setSelectedPOI = useMapStore((s) => s.setSelectedPOI);

  useEffect(() => {
    if (!map) return;

    const handlePOIClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;

      const [lng, lat] = feature.geometry.coordinates;
      const p = feature.properties;

      setSelectedPOI({
        id: p.id,
        title: p.title,
        description: p.description ?? null,
        category_id: p.category_id ?? null,
        is_verified: p.is_verified,
        tags: p.tags ? JSON.parse(p.tags) : null,
        lng,
        lat,
      });
    };

    const handleClusterClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;

      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource("pois") as maplibregl.GeoJSONSource;
      if (feature.geometry.type !== "Point") return;
      const center = feature.geometry.coordinates as [number, number];
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center, zoom });
      }).catch(() => {});
    };

    // Pointer cursor on hover
    const setCursor = () => { map.getCanvas().style.cursor = "pointer"; };
    const clearCursor = () => { map.getCanvas().style.cursor = ""; };

    map.on("click", "pois-unclustered", handlePOIClick);
    map.on("click", "pois-cluster", handleClusterClick);
    map.on("mouseenter", "pois-unclustered", setCursor);
    map.on("mouseleave", "pois-unclustered", clearCursor);
    map.on("mouseenter", "pois-cluster", setCursor);
    map.on("mouseleave", "pois-cluster", clearCursor);

    return () => {
      map.off("click", "pois-unclustered", handlePOIClick);
      map.off("click", "pois-cluster", handleClusterClick);
      map.off("mouseenter", "pois-unclustered", setCursor);
      map.off("mouseleave", "pois-unclustered", clearCursor);
      map.off("mouseenter", "pois-cluster", setCursor);
      map.off("mouseleave", "pois-cluster", clearCursor);
    };
  }, [map, setSelectedPOI]);
}
