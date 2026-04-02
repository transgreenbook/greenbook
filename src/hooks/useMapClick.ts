import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";

export function useMapClick(map: maplibregl.Map | null) {
  const setSelectedPOI    = useMapStore((s) => s.setSelectedPOI);
  const setSelectedRegion = useMapStore((s) => s.setSelectedRegion);
  const flyTo             = useMapStore((s) => s.flyTo);

  // True while the user is browsing states by clicking (programmatic zoom).
  // Cleared as soon as the user manually zooms with scroll/pinch.
  const stateBrowsingRef = useRef(false);

  useEffect(() => {
    if (!map) return;

    // Any user-initiated zoom (scroll wheel, pinch, double-click zoom) carries
    // an originalEvent. Programmatic flyTo/easeTo does not.
    const handleZoomStart = (e: maplibregl.MapLibreEvent) => {
      if (e.originalEvent) {
        stateBrowsingRef.current = false;
      }
    };

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

      // POI layers take priority
      if (map.getLayer("pois-cluster") && map.getLayer("pois-unclustered")) {
        const poiFeatures = map.queryRenderedFeatures(e.point, {
          layers: ["pois-cluster", "pois-unclustered", "pois-along-route"],
        });

        if (poiFeatures.length) {
          const feature = poiFeatures[0];
          if (feature.geometry.type !== "Point") return;
          const center = feature.geometry.coordinates as [number, number];

          if (feature.properties?.cluster_id != null) {
            const source = map.getSource("pois") as maplibregl.GeoJSONSource;
            source
              .getClusterExpansionZoom(feature.properties.cluster_id)
              .then((zoom) => map.easeTo({ center, zoom: zoom + 1 }))
              .catch(() => {});
            return;
          }

          const p = feature.properties!;
          flyTo({ lng: center[0], lat: center[1], zoom: 14 });
          setSelectedRegion(null);
          stateBrowsingRef.current = false;
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
          return;
        }
      }

      // Region layers.
      // In state-browsing mode (set by clicking a state, cleared by manual zoom)
      // skip city/county checks so the user can click state-to-state.
      // Otherwise gate by zoom: county at zoom >= 6, city at zoom >= 9.
      const zoom = map.getZoom();
      const inStateBrowsing = stateBrowsingRef.current;

      const cityFeatures = !inStateBrowsing && zoom >= 9 && map.getLayer("cities-fill")
        ? map.queryRenderedFeatures(e.point, { layers: ["cities-fill"] })
        : [];
      const countyFeatures = !inStateBrowsing && zoom >= 6 && map.getLayer("counties-fill")
        ? map.queryRenderedFeatures(e.point, { layers: ["counties-fill"] })
        : [];
      const stateFeatures = map.getLayer("states-fill")
        ? map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })
        : [];

      if (cityFeatures.length) {
        const props   = cityFeatures[0].properties ?? {};
        const name    = props.NAME    ?? "";
        const statefp = props.STATEFP ?? "";
        if (!name) return;

        const centroids = map.querySourceFeatures("cities-centroids");
        const centroid  = centroids.find(
          (f) => f.properties?.NAME === name && f.properties?.STATEFP === statefp
        );
        if (centroid?.geometry.type === "Point") {
          const [lng, lat] = centroid.geometry.coordinates as [number, number];
          flyTo({ lng, lat, zoom: 12 });
        }
        setSelectedPOI(null);
        setSelectedRegion({ type: "city", name, statefp });
        return;
      }

      if (countyFeatures.length) {
        const props    = countyFeatures[0].properties ?? {};
        const name     = props.NAME     ?? "";
        const statefp  = props.STATEFP  ?? "";
        const countyfp = props.COUNTYFP ?? "";
        const fips5    = props.GEOID    ?? (statefp + countyfp);
        if (!fips5) return;

        const centroids = map.querySourceFeatures("counties-centroids");
        const centroid  = centroids.find(
          (f) => f.properties?.STATEFP === statefp && f.properties?.COUNTYFP === countyfp
        );
        if (centroid?.geometry.type === "Point") {
          const [lng, lat] = centroid.geometry.coordinates as [number, number];
          flyTo({ lng, lat, zoom: 10 });
        }
        setSelectedPOI(null);
        setSelectedRegion({ type: "county", name, fips5 });
        return;
      }

      if (stateFeatures.length) {
        const props     = stateFeatures[0].properties ?? {};
        const stateAbbr = props.STUSPS ?? props.abbreviation ?? "";
        const name      = props.NAME   ?? props.name ?? stateAbbr;
        if (!stateAbbr) return;

        const centroids = map.querySourceFeatures("states-centroids");
        const centroid  = centroids.find((f) => f.properties?.STUSPS === stateAbbr);
        if (centroid?.geometry.type === "Point") {
          const [lng, lat] = centroid.geometry.coordinates as [number, number];
          flyTo({ lng, lat, zoom: 6 });
        }
        setSelectedPOI(null);
        setSelectedRegion({ type: "state", name, stateAbbr });
        stateBrowsingRef.current = true;
        return;
      }
    };

    const setCursor = (e: maplibregl.MapMouseEvent) => {
      const { isRoutingMode } = useRouteStore.getState();
      if (isRoutingMode) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }

      const zoom = map.getZoom();
      const inStateBrowsing = stateBrowsingRef.current;
      const clickableLayers: string[] = [];
      if (map.getLayer("pois-cluster"))     clickableLayers.push("pois-cluster");
      if (map.getLayer("pois-unclustered")) clickableLayers.push("pois-unclustered");
      if (map.getLayer("pois-along-route")) clickableLayers.push("pois-along-route");
      if (!inStateBrowsing && zoom >= 9  && map.getLayer("cities-fill"))   clickableLayers.push("cities-fill");
      if (!inStateBrowsing && zoom >= 6  && map.getLayer("counties-fill")) clickableLayers.push("counties-fill");
      if (map.getLayer("states-fill"))                                      clickableLayers.push("states-fill");

      const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    };

    map.on("zoomstart", handleZoomStart);
    map.on("click", handleClick);
    map.on("mousemove", setCursor);

    return () => {
      map.off("zoomstart", handleZoomStart);
      map.off("click", handleClick);
      map.off("mousemove", setCursor);
    };
  }, [map, setSelectedPOI, setSelectedRegion, flyTo]);
}
