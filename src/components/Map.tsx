"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapLayers } from "@/hooks/useMapLayers";
import { useMapPOIs } from "@/hooks/useMapPOIs";
import { useMapClick } from "@/hooks/useMapClick";
import { useRouteLayer } from "@/hooks/useRouteLayer";
import { useRegionHighlight } from "@/hooks/useRegionHighlight";
import { useRegionColors } from "@/hooks/useRegionColors";
import { useMapStore } from "@/store/mapStore";

// Bounding box of the continental US
const CONUS_BOUNDS: [[number, number], [number, number]] = [
  [-124.848974, 24.396308], // SW
  [-66.885444,  49.384358], // NE
];

export default function Map() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);

  const pendingFlyTo = useMapStore((s) => s.pendingFlyTo);
  const clearFlyTo = useMapStore((s) => s.clearFlyTo);

  useMapLayers(map);
  useMapPOIs(map);
  useMapClick(map);
  useRouteLayer(map);
  useRegionHighlight(map);
  useRegionColors(map);

  useEffect(() => {
    if (!map || !pendingFlyTo) return;
    if (pendingFlyTo.bounds) {
      map.fitBounds(pendingFlyTo.bounds, { padding: 32, duration: 1200 });
    } else {
      map.flyTo({
        center: [pendingFlyTo.lng, pendingFlyTo.lat],
        zoom: pendingFlyTo.zoom ?? map.getZoom(),
        duration: 1200,
      });
    }
    clearFlyTo();
  }, [map, pendingFlyTo, clearFlyTo]);

  useEffect(() => {
    if (!containerRef.current) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

    const apiKey = process.env.NEXT_PUBLIC_STADIA_API_KEY;
    const styleUrl = apiKey
      ? `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${apiKey}`
      : "https://demotiles.maplibre.org/style.json";

    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      bounds: CONUS_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      minZoom: 2,
    });

    instance.addControl(new maplibregl.NavigationControl(), "top-right");
    instance.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right"
    );
    const scaleControl = new maplibregl.ScaleControl({ unit: "imperial", maxWidth: 120 });
    instance.addControl(scaleControl, "bottom-left");

    // Make the scale bar clickable to toggle mi ↔ km
    const scaleEl = instance.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-scale");
    if (scaleEl) {
      let unit: "imperial" | "metric" = "imperial";
      scaleEl.style.cursor = "pointer";
      scaleEl.title = "Click to switch between mi and km";
      scaleEl.addEventListener("click", () => {
        unit = unit === "imperial" ? "metric" : "imperial";
        scaleControl.setUnit(unit);
        scaleEl.title = unit === "imperial" ? "Click to switch to km" : "Click to switch to mi";
      });
    }

    instance.on("zoom", () => setZoom(instance.getZoom()));
    instance.once("load", () => setZoom(instance.getZoom()));

    // Setting state triggers a re-render, which re-runs useMapLayers/useMapPOIs
    // with the real map instance instead of null.
    setMap(instance);

    return () => {
      setMap(null);
      instance.remove();
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  return (
    <>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {zoom !== null && (
        <div style={{ position: "absolute", bottom: 32, right: 8, pointerEvents: "none" }}
          className="bg-white/80 text-gray-700 text-xs font-mono px-2 py-0.5 rounded shadow">
          z{zoom.toFixed(1)}
        </div>
      )}
    </>
  );
}
