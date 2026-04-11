import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { registerLayers } from "@/lib/mapLayers";

// ---------------------------------------------------------------------------
// Icon loading — fetch an SVG, inject a fill color, rasterize via canvas,
// and return the raw pixel data MapLibre expects.
// ---------------------------------------------------------------------------

type MapImage = { width: number; height: number; data: Uint8Array };

async function svgToMapImage(url: string, fill: string, size: number): Promise<MapImage> {
  const res = await fetch(url);
  const svgText = await res.text();

  // Inject fill color onto the root <svg> element.
  // Use a data: URI instead of a blob URL — Safari/WebKit blocks blob URLs
  // in canvas (getImageData throws a SecurityError / "Load failed").
  const colored = svgText.replace("<svg ", `<svg fill="${fill}" `);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;

  return new Promise((resolve, reject) => {
    const img = new Image(size, size);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      resolve({ width: size, height: size, data: new Uint8Array(data.buffer) });
    };
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = dataUrl;
  });
}

const POI_ICONS: Array<{ name: string; url: string; fill: string }> = [
  { name: "poi-restroom", url: "/icons/transgender-symbol.svg", fill: "#1e40af" },
];

const ICON_SIZE = 48; // render at 2× for retina sharpness

export function useMapLayers(map: maplibregl.Map | null) {
  useEffect(() => {
    if (!map) return;

    async function setup() {
      await Promise.all(
        POI_ICONS.map(async ({ name, url, fill }) => {
          if (!map!.hasImage(name)) {
            try {
              const image = await svgToMapImage(url, fill, ICON_SIZE);
              map!.addImage(name, image, { pixelRatio: 2 });
            } catch (e) {
              console.warn(`Could not load map icon "${name}":`, e);
            }
          }
        })
      );
      registerLayers(map!);
    }

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("load", () => setup());
    }
  }, [map]);
}
