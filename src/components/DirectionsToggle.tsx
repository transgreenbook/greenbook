"use client";

import { useRouteStore } from "@/store/routeStore";

export default function DirectionsToggle() {
  const isRoutingMode = useRouteStore((s) => s.isRoutingMode);
  const setRoutingMode = useRouteStore((s) => s.setRoutingMode);
  const clearRoute = useRouteStore((s) => s.clearRoute);

  function toggle() {
    if (isRoutingMode) {
      clearRoute();
      setRoutingMode(false);
    } else {
      setRoutingMode(true);
    }
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
        isRoutingMode
          ? "bg-blue-600 text-white"
          : "text-gray-600 hover:bg-gray-100"
      }`}
      aria-label="Toggle directions"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
      Directions
    </button>
  );
}
