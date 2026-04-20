"use client";

import { useEffect, useState } from "react";
import SimpleMarkdown from "@/components/SimpleMarkdown";
import { useMapStore } from "@/store/mapStore";
import { useAppStore } from "@/store/appStore";
import { useRouteStore } from "@/store/routeStore";
import { supabase } from "@/lib/supabase";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useMobileSheet } from "@/hooks/useMobileSheet";

interface FullPOI {
  id: number;
  title: string;
  description: string | null;
  long_description: string | null;
  tags: string[] | null;
  lat: number;
  lng: number;
  is_verified: boolean;
  legislation_url: string | null;
  attributes: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Recency badge for safety incidents and law POIs
// ---------------------------------------------------------------------------

type RecencyTier = {
  label: string;
  className: string;
} | null;

function getRecencyTier(attributes: Record<string, unknown> | null | undefined): RecencyTier {
  const dateStr = attributes?.enacted_date;
  if (!dateStr || typeof dateStr !== "string") return null;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  const daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);

  if (daysAgo < 30)  return { label: "Recent",       className: "bg-red-100 text-red-700" };
  if (daysAgo < 365) return { label: "This year",    className: "bg-orange-100 text-orange-700" };
  if (daysAgo < 730) return { label: "1–2 years ago", className: "bg-yellow-100 text-yellow-700" };
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function POIDetailPanel() {
  const { selectedPOI, setSelectedPOI } = useMapStore();
  const { closePOI } = useAppStore();
  const setEnd = useRouteStore((s) => s.setEnd);
  const setRoutingMode = useRouteStore((s) => s.setRoutingMode);

  const [fullPOI, setFullPOI] = useState<FullPOI | null>(null);
  const [loading, setLoading] = useState(false);
  const panelWidthValue = useAppStore((s) => s.panelWidths.poi);
  const setPanelWidth   = useAppStore((s) => s.setPanelWidth);
  const { width: panelWidth, onDragHandleMouseDown } = useResizablePanel({
    value: panelWidthValue,
    onChange: (w) => setPanelWidth("poi", w),
  });

  const {
    isExpanded: mobileExpanded,
    isDragging: mobileDragging,
    sheetStyle: mobileSheetStyle,
    toggle: toggleMobile,
    handleProps: mobileHandleProps,
  } = useMobileSheet({ collapsedHeight: 64 });

  useEffect(() => {
    if (!selectedPOI) return;
    let cancelled = false;
    setLoading(true);
    setFullPOI(null);

    supabase
      .from("pois")
      .select("id, title, description, long_description, tags, lat, lng, is_verified, legislation_url, attributes")
      .eq("id", selectedPOI.id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setFullPOI(data as FullPOI);
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedPOI?.id]);

  if (!selectedPOI) return null;

  function handleClose() {
    setSelectedPOI(null);
    closePOI();
  }

  function handleRouteToHere() {
    setEnd({ lng: selectedPOI!.lng, lat: selectedPOI!.lat, label: selectedPOI!.title });
    setRoutingMode(true);
    useAppStore.getState().setMode("route");
  }

  const poi = fullPOI ?? selectedPOI;
  const recency = getRecencyTier(fullPOI?.attributes);
  const sourceUrl      = typeof fullPOI?.attributes?.source_url === "string"
    ? fullPOI.attributes.source_url
    : null;
  const legislationUrl = fullPOI?.legislation_url ?? null;

  // Badges shown in the header (Verified + recency)
  const badges = (
    <div className="flex flex-wrap items-center gap-2 mt-0.5">
      {poi.is_verified && (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Verified
        </span>
      )}
      {recency && (
        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${recency.className}`}>
          {recency.label}
        </span>
      )}
    </div>
  );

  const content = (
    <>
      {loading && (
        <p className="text-sm text-gray-400">Loading…</p>
      )}

      {poi.description && (
        <p className="text-sm text-gray-700 leading-relaxed">{poi.description}</p>
      )}

      {fullPOI?.long_description && (
        <SimpleMarkdown>{fullPOI.long_description}</SimpleMarkdown>
      )}

      {poi.tags && poi.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {poi.tags.map((tag) => (
            <span
              key={tag}
              className="bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        {selectedPOI.lat.toFixed(5)}, {selectedPOI.lng.toFixed(5)}
      </p>

      <div className="pt-1 border-t border-gray-100 flex flex-wrap gap-3">
        <button
          onClick={handleRouteToHere}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          Get directions
        </button>
        {legislationUrl && (
          <a
            href={legislationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View legislation
          </a>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Source
          </a>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Desktop: right sidebar                                              */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="hidden md:flex absolute top-0 right-0 h-full bg-white shadow-lg z-10 flex-col"
        style={{ width: panelWidth }}
      >
        <div
          onMouseDown={onDragHandleMouseDown}
          className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-400/60 z-20 transition-colors"
          title="Drag to resize"
        />
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 shrink-0 gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 text-lg leading-snug">{poi.title}</h2>
            {badges}
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {content}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile: bottom sheet                                                */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`
          md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.12)]
          flex flex-col
          ${mobileDragging ? "" : "transition-[height] duration-300 ease-in-out"}
          ${mobileDragging ? "" : mobileExpanded ? "h-[70vh]" : "h-16"}
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
            <div className="min-w-0 flex-1 mr-3">
              <h2 className="font-semibold text-gray-900 text-base truncate">{poi.title}</h2>
            </div>
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
                onClick={(e) => { e.stopPropagation(); handleClose(); }}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2 space-y-5">
          {content}
        </div>
      </div>
    </>
  );
}
