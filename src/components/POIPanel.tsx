"use client";

import { useEffect, useState } from "react";
import { useMapStore } from "@/store/mapStore";

export default function POIPanel() {
  const { selectedPOI, setSelectedPOI } = useMapStore();
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  // Reset mobile sheet to peek state whenever a new POI is selected
  useEffect(() => {
    if (selectedPOI) setMobileExpanded(false);
  }, [selectedPOI?.id]);

  if (!selectedPOI) return null;

  const content = (
    <>
      {selectedPOI.description && (
        <p className="text-sm text-gray-600 leading-relaxed">
          {selectedPOI.description}
        </p>
      )}
      <div className="text-xs text-gray-400 space-y-1">
        <div>
          {selectedPOI.lat.toFixed(5)}, {selectedPOI.lng.toFixed(5)}
        </div>
        {selectedPOI.tags && selectedPOI.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {selectedPOI.tags.map((tag) => (
              <span
                key={tag}
                className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
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
          flex-col transition-[width] duration-300 overflow-hidden
          ${desktopCollapsed ? "w-0" : "w-80"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="font-semibold text-gray-800 text-base truncate pr-2">
            {selectedPOI.title}
          </h2>
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
            <button
              onClick={() => setSelectedPOI(null)}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {content}
        </div>
      </div>

      {/* Collapsed tab — reopens the sidebar */}
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
            {selectedPOI.title}
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
          ${mobileExpanded ? "h-[70vh]" : "h-20"}
        `}
      >
        {/* Drag handle + header row — div instead of button to avoid nested <button> */}
        <div
          className="w-full shrink-0 flex flex-col items-center pt-2 pb-1 cursor-pointer"
          onClick={() => setMobileExpanded((v) => !v)}
          role="button"
          aria-label={mobileExpanded ? "Collapse" : "Expand"}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300 mb-2" />
          <div className="w-full flex items-center justify-between px-4">
            <h2 className="font-semibold text-gray-800 text-base truncate">
              {selectedPOI.title}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${mobileExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedPOI(null); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable body — only visible when expanded */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2 space-y-3">
          {content}
        </div>
      </div>
    </>
  );
}
