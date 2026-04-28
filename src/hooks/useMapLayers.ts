import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { registerLayers } from "@/lib/mapLayers";
import { useMapStore } from "@/store/mapStore";

// ---------------------------------------------------------------------------
// Icon loading — fetch an SVG, inject fill + explicit dimensions, then decode
// via HTMLImageElement.decode() and pass directly to map.addImage.
// Avoids map.loadImage (doesn't handle SVG) and canvas getImageData (Safari
// security errors with blob URLs).
// ---------------------------------------------------------------------------

const ICON_PX = 48; // physical pixels; pixelRatio:2 → 24 CSS px on the map

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const POI_ICONS: Array<{ name: string; url: string; fill: string }> = [
  { name: "poi-restroom", url: `${basePath}/icons/transgender-symbol.svg`, fill: "#1e40af" },
];


export function useMapLayers(map: maplibregl.Map | null) {
  useEffect(() => {
    if (!map) return;

    async function loadIcon(name: string, url: string, fill: string) {
      if (map!.hasImage(name)) return;
      try {
        const res = await fetch(url);
        const svgText = await res.text();
        // Inject fill color and explicit pixel dimensions so MapLibre gets a
        // correctly-sized image without needing canvas rasterisation.
        const colored = svgText.replace(
          "<svg ",
          `<svg fill="${fill}" width="${ICON_PX}" height="${ICON_PX}" `
        );
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        if (!map!.hasImage(name)) {
          map!.addImage(name, img, { pixelRatio: 2 });
          console.log(`[map] loaded icon "${name}"`);
        }
      } catch (e) {
        console.warn(`[map] could not load icon "${name}":`, e);
      }
    }

    async function setup() {
      await Promise.all(POI_ICONS.map(({ name, url, fill }) => loadIcon(name, url, fill)));
      registerLayers(map!);
    }

    // Re-load a specific icon after a style reload clears custom images.
    const onImageMissing = async (e: { id: string }) => {
      const icon = POI_ICONS.find((i) => i.name === e.id);
      if (!icon) return;
      await loadIcon(icon.name, icon.url, icon.fill);
      map.triggerRepaint();
    };

    map.on("styleimagemissing", onImageMissing);

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("load", () => setup());
    }

    return () => {
      map.off("styleimagemissing", onImageMissing);
    };
  }, [map]);

  // Hide regular POI layers while box selection OR region selection is active.
  const boxSelectionBounds = useMapStore((s) => s.boxSelectionBounds);
  const selectedRegion     = useMapStore((s) => s.selectedRegion);
  useEffect(() => {
    if (!map) return;
    const hideRegular = !!(boxSelectionBounds || selectedRegion);
    const regularVisibility = hideRegular ? "none" : "visible";
    const regularLayers = [
      "pois-cluster", "pois-cluster-count",
      "pois-negative-cluster", "pois-negative-cluster-count",
      "pois-unclustered", "pois-negative-unclustered",
      "pois-unclustered-icons",
    ];
    for (const id of regularLayers) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", regularVisibility);
    }
    // Show region layers only when a region is selected (and no box selection)
    const regionVisibility = (selectedRegion && !boxSelectionBounds) ? "visible" : "none";
    const regionLayers = [
      "pois-region-cluster", "pois-region-cluster-count",
      "pois-region-unclustered",
    ];
    for (const id of regionLayers) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", regionVisibility);
    }
  }, [map, boxSelectionBounds, selectedRegion]);

  // Keep pois-bbox-selection source in sync with store
  const boxSelectionPois = useMapStore((s) => s.boxSelectionPois);
  useEffect(() => {
    if (!map) return;
    const source = map.getSource("pois-bbox-selection") as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: boxSelectionPois.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id, color: p.color, title: p.title,
          description: p.description, category_id: p.category_id,
          is_verified: p.is_verified, tags: JSON.stringify(p.tags ?? []),
          icon: p.icon,
        },
      })),
    });
  }, [map, boxSelectionPois]);

  // Keep pois-region source in sync with store
  const regionPois = useMapStore((s) => s.regionPois);
  useEffect(() => {
    if (!map) return;
    const source = map.getSource("pois-region") as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: regionPois.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id, color: p.color, title: p.title,
          description: p.description, category_id: p.category_id,
          is_verified: p.is_verified, tags: JSON.stringify(p.tags ?? []),
          icon: p.icon,
        },
      })),
    });
  }, [map, regionPois]);
}
