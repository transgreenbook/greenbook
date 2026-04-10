"use client";

import { useAppStore } from "@/store/appStore";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import type { AppMode } from "@/store/appStore";

const TABS: { id: AppMode; label: string; icon: React.ReactNode }[] = [
  {
    id: "map",
    label: "Map",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    id: "route",
    label: "Directions",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
    ),
  },
  {
    id: "poi",
    label: "Detail",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "about",
    label: "About",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function ModeToggle() {
  const { mode, setMode } = useAppStore();
  const selectedPOI = useMapStore((s) => s.selectedPOI);
  const { setRoutingMode, clearRoute } = useRouteStore();

  function handleSelect(id: AppMode) {
    if (id === mode) return;

    if (id === "route") {
      setRoutingMode(true);
    } else if (mode === "route") {
      clearRoute();
      setRoutingMode(false);
    }

    setMode(id);
  }

  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
      {TABS.map((tab) => {
        const isDisabled = tab.id === "poi" && !selectedPOI;
        const isActive = mode === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => !isDisabled && handleSelect(tab.id)}
            disabled={isDisabled}
            className={`
              flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-md transition-colors
              ${isActive
                ? "bg-white text-gray-900 shadow-sm"
                : isDisabled
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/60"}
            `}
            aria-label={tab.label}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
