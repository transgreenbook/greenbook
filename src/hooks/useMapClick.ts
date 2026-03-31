import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";

export function useMapClick(map: maplibregl.Map | null) {
  const setSelectedPOI = useMapStore((s) => s.setSelectedPOI);
  const flyTo = useMapStore((s) => s.flyTo);

  useEffect(() => {
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { isRoutingMode, start, end, setStart, setEnd } = useRouteStore.getState();

      // Routing mode — drop a waypoint on the map click
      if (isRoutingMode) {
        const { lng, lat } = e.lngLat;
        const label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        if (!start) {
          setStart({ lng, lat, label });
        } else if (!end) {
          setEnd({ lng, lat, label });
        }
        return;
      }

      // Normal mode — select POI
      if (!map.getLayer("pois-cluster") || !map.getLayer("pois-unclustered")) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["pois-cluster", "pois-unclustered", "pois-along-route"],
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

      // Individual POI — zoom to it and open detail panel
      const p = feature.properties!;
      flyTo({ lng: center[0], lat: center[1], zoom: 14 });
      setSelectedPOI({
        id: p.id,
        title: p.title,
        description: p.description ?? null,
        category_id: p.category_id ?? null,
        is_verified: p.is_verified,
        tags: p.tags ? JSON.parse(p.tags) : null,
        color: p.color ?? null,
        lng: center[0],
        lat: center[1],
      });
    };

    const setCursor = (e: maplibregl.MapMouseEvent) => {
      const { isRoutingMode } = useRouteStore.getState();
      if (isRoutingMode) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }
      if (!map.getLayer("pois-cluster") || !map.getLayer("pois-unclustered")) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["pois-cluster", "pois-unclustered", "pois-along-route"],
      });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    };

    map.on("click", handleClick);
    map.on("mousemove", setCursor);

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", setCursor);
    };
  }, [map, setSelectedPOI, flyTo]);
}
