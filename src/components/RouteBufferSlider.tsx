"use client";

import { useRouteStore } from "@/store/routeStore";

function formatDistance(meters: number): string {
  if (meters <= 0) return "0";
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}

export default function RouteBufferSlider() {
  const baseBufferMeters  = useRouteStore((s) => s.baseBufferMeters);
  const bufferMultiplier  = useRouteStore((s) => s.bufferMultiplier);
  const setBufferMultiplier = useRouteStore((s) => s.setBufferMultiplier);

  // Only show once we have a route with a measured buffer
  if (baseBufferMeters === null) return null;

  const actualMeters = baseBufferMeters * bufferMultiplier / 100;
  const label = bufferMultiplier === 0 ? "off" : `within ${formatDistance(actualMeters)}`;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      <div className="pointer-events-auto bg-white/90 backdrop-blur-sm rounded-full shadow-md border border-gray-200 px-4 py-2 flex items-center gap-3 min-w-56">
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="range"
          min={0}
          max={200}
          step={5}
          value={bufferMultiplier}
          onChange={(e) => setBufferMultiplier(Number(e.target.value))}
          className="flex-1 accent-blue-500 h-1.5"
          aria-label="POI search radius"
        />
        <span className="text-xs font-medium text-gray-600 whitespace-nowrap w-20 text-right">
          {label}
        </span>
      </div>
    </div>
  );
}
