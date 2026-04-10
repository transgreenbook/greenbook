"use client";

import { useState } from "react";
import { useRouteStore } from "@/store/routeStore";
import { useMapStore } from "@/store/mapStore";
import { useResizablePanel } from "@/hooks/useResizablePanel";

export default function RoutePOIPanel() {
  const isRoutingMode  = useRouteStore((s) => s.isRoutingMode);
  const route          = useRouteStore((s) => s.route);
  const isLoading      = useRouteStore((s) => s.isLoading);
  const poisAlongRoute = useRouteStore((s) => s.poisAlongRoute);
  const routeBuffer    = useRouteStore((s) => s.routeBuffer);
  const flyTo          = useMapStore((s) => s.flyTo);
  const setSelectedPOI = useMapStore((s) => s.setSelectedPOI);

  const [mobileExpanded, setMobileExpanded]     = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const { width: panelWidth, onDragHandleMouseDown } = useResizablePanel();

  // Only render when routing mode is active and we have (or are loading) a route
  if (!isRoutingMode || (!route && !isLoading)) return null;

  function handlePOIClick(poi: (typeof poisAlongRoute)[number]) {
    flyTo({ lng: poi.lng, lat: poi.lat, zoom: 14 });
    setSelectedPOI({
      id:          poi.id,
      title:       poi.title,
      description: poi.description,
      category_id: poi.category_id,
      is_verified: poi.is_verified,
      tags:        poi.tags,
      color:       poi.color,
      icon:        poi.icon ?? null,
      lng:         poi.lng,
      lat:         poi.lat,
    });
  }

  const header = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        POIs along route
      </span>
      {routeBuffer && (
        <span className="text-xs text-gray-400">within {routeBuffer}</span>
      )}
      {!isLoading && poisAlongRoute.length > 0 && (
        <span className="text-xs text-gray-400">· {poisAlongRoute.length} found</span>
      )}
    </div>
  );

  const content = (
    <>
      {isLoading && (
        <p className="text-sm text-gray-400">Searching for POIs along the route…</p>
      )}
      {!isLoading && route && poisAlongRoute.length === 0 && (
        <p className="text-sm text-gray-400">
          No POIs found within {routeBuffer ?? "1 mi"} of this route.
        </p>
      )}
      {!isLoading && poisAlongRoute.length > 0 && (
        <ul className="-mx-4">
          {poisAlongRoute.map((poi) => (
            <li key={poi.id}>
              <button
                className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-start gap-3"
                onClick={() => handlePOIClick(poi)}
              >
                <span
                  className="mt-1 w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: poi.color ?? "#3b82f6" }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{poi.title}</div>
                  {poi.description && (
                    <div className="text-xs text-gray-400 truncate">{poi.description}</div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Desktop: collapsible right sidebar                                  */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`
          hidden md:flex absolute top-0 right-0 h-full bg-white shadow-lg z-10
          flex-col overflow-hidden
          ${desktopCollapsed ? "w-0 transition-[width] duration-300" : ""}
        `}
        style={desktopCollapsed ? undefined : { width: panelWidth }}
      >
        {/* Drag handle — left edge */}
        {!desktopCollapsed && (
          <div
            onMouseDown={onDragHandleMouseDown}
            className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-400/60 z-20 transition-colors"
            title="Drag to resize"
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          {header}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setDesktopCollapsed(true)}
              className="text-gray-400 hover:text-gray-600 p-1"
              aria-label="Collapse panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {content}
        </div>
      </div>

      {/* Collapsed tab */}
      {desktopCollapsed && (
        <button
          onClick={() => setDesktopCollapsed(false)}
          className="
            hidden md:flex absolute top-1/2 -translate-y-1/2 right-0 z-10
            bg-white shadow-md border border-gray-200 rounded-l-lg
            flex-col items-center gap-1 px-1.5 py-3
            text-gray-500 hover:text-gray-800 hover:bg-gray-50
          "
          aria-label="Open panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-xs font-medium [writing-mode:vertical-rl] rotate-180">
            POIs along route
          </span>
        </button>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Mobile: bottom sheet                                                */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`
          md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.12)]
          transition-[height] duration-300 ease-in-out flex flex-col
          ${mobileExpanded ? "h-[70vh]" : "h-16"}
        `}
      >
        <div
          className="w-full shrink-0 flex flex-col items-center pt-2 pb-1 cursor-pointer"
          onClick={() => setMobileExpanded((v) => !v)}
          role="button"
          aria-label={mobileExpanded ? "Collapse" : "Expand"}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300 mb-2" />
          <div className="w-full flex items-center justify-between px-4">
            {header}
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${mobileExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2 space-y-1">
          {content}
        </div>
      </div>
    </>
  );
}
