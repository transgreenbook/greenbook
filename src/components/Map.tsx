"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapLayers } from "@/hooks/useMapLayers";
import { useMapPOIs } from "@/hooks/useMapPOIs";

const INITIAL_CENTER: [number, number] = [-95.7129, 37.0902];
const INITIAL_ZOOM = 4;

export default function Map() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  useMapLayers(map);
  useMapPOIs(map);

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
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 3,
    });

    instance.addControl(new maplibregl.NavigationControl(), "top-right");
    instance.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right"
    );
    instance.addControl(new maplibregl.ScaleControl(), "bottom-left");

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
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
