"use client";

import { useState } from "react";
import { useMobileSheet } from "@/hooks/useMobileSheet";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import { useAppStore } from "@/store/appStore";
import { useRegionPOIs } from "@/hooks/useRegionPOIs";
import type { RegionPOI } from "@/hooks/useRegionPOIs";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useFilterStore } from "@/store/filterStore";
import POIFilter from "@/components/POIFilter";

const REGION_LABEL: Record<string, string> = {
  state:  "State",
  county: "County",
  city:   "City",
};

export default function RegionPOIPanel() {
  const { selectedRegion, setSelectedRegion, setSelectedPOI, flyTo } = useMapStore();
  const isRoutingMode = useRouteStore((s) => s.isRoutingMode);
  const openPOI = useAppStore((s) => s.openPOI);
  const { data: pois, isLoading } = useRegionPOIs(selectedRegion);

  const hiddenCategoryIds = useFilterStore((s) => s.hiddenCategoryIds);
  const filtersActive     = hiddenCategoryIds.length > 0;

  const {
    isExpanded: mobileExpanded,
    isDragging: mobileDragging,
    sheetStyle: mobileSheetStyle,
    toggle: toggleMobile,
    handleProps: mobileHandleProps,
  } = useMobileSheet({ collapsedHeight: 80 }); // h-20 = 80px
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [showFilter, setShowFilter]             = useState(false);
  const { width: panelWidth, onDragHandleMouseDown } = useResizablePanel();

  if (!selectedRegion || isRoutingMode) return null;

  function handlePOIClick(poi: RegionPOI) {
    flyTo({ lng: poi.lng, lat: poi.lat, zoom: 14 });
    setSelectedPOI({
      id: poi.id,
      title: poi.title,
      description: poi.description,
      long_description: null,
      category_id: poi.category_id,
      is_verified: poi.is_verified,
      tags: poi.tags,
      color: poi.color,
      icon: poi.icon ?? null,
      lng: poi.lng,
      lat: poi.lat,
    });
    setSelectedRegion(null);
    openPOI("map");
  }

  const typeLabel = REGION_LABEL[selectedRegion.type];

  const visiblePois = pois?.filter(
    (p) => !p.category_id || !hiddenCategoryIds.includes(p.category_id)
  ) ?? [];

  const content = (
    <>
      {isLoading && (
        <p className="text-sm text-gray-400">Loading POIs…</p>
      )}
      {!isLoading && visiblePois.length === 0 && (pois?.length ?? 0) > 0 && (
        <p className="text-sm text-gray-400">All POIs in this area are hidden by your filters.</p>
      )}
      {!isLoading && pois && pois.length === 0 && (
        <p className="text-sm text-gray-400">No POIs found for {selectedRegion.name}.</p>
      )}
      {!isLoading && visiblePois.length > 0 && (
        <ul className="-mx-4">
          {visiblePois.map((poi) => (
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-amber-600 uppercase tracking-wide">
                {typeLabel}
              </span>
              {pois && (
                <span className="text-xs text-gray-400">
                  {filtersActive ? `${visiblePois.length} of ${pois.length}` : `${pois.length}`} POI{pois.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <h2 className="font-semibold text-gray-800 text-base truncate">
              {selectedRegion.name}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowFilter((v) => !v)}
              className={`relative p-1 ${showFilter || filtersActive ? "text-blue-500" : "text-gray-400 hover:text-gray-600"}`}
              aria-label="Filter by category"
              title="Filter by category"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 10h10M11 16h2" />
              </svg>
              {filtersActive && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
            <button
              onClick={() => setDesktopCollapsed(true)}
              className="text-gray-400 hover:text-gray-600 p-1"
              aria-label="Collapse panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setSelectedRegion(null)}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {showFilter && <POIFilter />}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {content}
        </div>
      </div>

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
          <span className="text-xs font-medium [writing-mode:vertical-rl] rotate-180 max-h-24 overflow-hidden truncate">
            {selectedRegion.name}
          </span>
        </button>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Mobile: bottom sheet                                                */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`
          md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.12)]
          flex flex-col
          ${mobileDragging ? "" : "transition-[height] duration-300 ease-in-out"}
          ${mobileDragging ? "" : mobileExpanded ? "h-[70vh]" : "h-20"}
        `}
        style={mobileSheetStyle}
      >
        <div
          className="w-full shrink-0 flex flex-col items-center pt-2 pb-1 cursor-pointer touch-none"
          onClick={toggleMobile}
          role="button"
          aria-label={mobileExpanded ? "Collapse" : "Expand"}
          {...mobileHandleProps}
        >
          <div className="w-full flex justify-center pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>
          <div className="w-full flex items-center justify-between px-4">
            <div className="min-w-0">
              <span className="text-xs font-medium text-amber-600 uppercase tracking-wide mr-2">
                {typeLabel}
              </span>
              <span className="font-semibold text-gray-800 text-base truncate">
                {selectedRegion.name}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowFilter((v) => !v); }}
                className={`relative p-1 ${showFilter || filtersActive ? "text-blue-500" : "text-gray-400"}`}
                aria-label="Filter by category"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 10h10M11 16h2" />
                </svg>
                {filtersActive && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
              </button>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${mobileExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedRegion(null); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {showFilter && <POIFilter />}
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2 space-y-1">
          {content}
        </div>
      </div>
    </>
  );
}
