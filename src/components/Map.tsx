"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapLayers } from "@/hooks/useMapLayers";
import { useMapPOIs } from "@/hooks/useMapPOIs";

const INITIAL_CENTER: [number, number] = [-95.7129, 37.0902];
const INITIAL_ZOOM = 4;

export default function Map() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useMapLayers(mapRef);
  useMapPOIs(mapRef);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    // Register the pmtiles:// protocol handler once, before the map loads.
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

    const apiKey = process.env.NEXT_PUBLIC_STADIA_API_KEY;
    const styleUrl = apiKey
      ? `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${apiKey}`
      : "https://demotiles.maplibre.org/style.json";

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 3,
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right"
    );
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");

    return () => {
      mapRef.current = null;
      map.remove();
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
