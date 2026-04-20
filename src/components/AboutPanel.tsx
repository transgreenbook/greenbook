"use client";

import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useAppStore } from "@/store/appStore";
import { useMobileSheet } from "@/hooks/useMobileSheet";

export default function AboutPanel() {
  const panelWidthValue = useAppStore((s) => s.panelWidths.about);
  const setPanelWidth   = useAppStore((s) => s.setPanelWidth);
  const { width: panelWidth, onDragHandleMouseDown, onDragHandleTouchStart } = useResizablePanel({
    value: panelWidthValue,
    onChange: (w) => setPanelWidth("about", w),
  });

  const {
    isExpanded: mobileExpanded,
    isDragging: mobileDragging,
    sheetStyle: mobileSheetStyle,
    toggle: toggleMobile,
    handleProps: mobileHandleProps,
  } = useMobileSheet({ collapsedHeight: 56 });

  const content = (
    <>
      <p>
        TransSafeTravels is a community resource for transgender and gender-nonconforming
        travelers navigating the United States. We map laws, policies, healthcare providers,
        safe spaces, and points of concern so you can plan your journey with confidence.
      </p>
      <p>
        Information is crowd-sourced and verified by community members. Laws and policies
        change frequently — always confirm details before traveling.
      </p>
      <div className="pt-2 space-y-2">
        <p className="font-bold text-gray-800">Map controls</p>
        <ul className="space-y-1.5 text-gray-600">
          <li><span className="font-medium text-gray-700">Left-click</span> a state, county, or city — zoom in and show POIs for that region.</li>
          <li><span className="font-medium text-gray-700">Right-click</span> a state, county, or city — select the region without moving the map.</li>
          <li><span className="font-medium text-gray-700">Left-click</span> a POI marker — fly to it and open the Detail panel.</li>
          <li><span className="font-medium text-gray-700">Right-click</span> a POI marker — open the Detail panel without moving the map.</li>
        </ul>
        <p className="font-bold text-gray-800 pt-1">Directions</p>
        <ul className="space-y-1.5 text-gray-600">
          <li>Type an address or <span className="font-medium text-gray-700">click the map</span> to drop start and end points.</li>
          <li>Use the <span className="font-medium text-gray-700">search radius slider</span> to widen or narrow the POI search along your route.</li>
          <li>Click <span className="font-medium text-gray-700">POIs along route</span> to zoom back out to the full route.</li>
        </ul>
      </div>

      <div className="pt-2 space-y-1">
        <p className="font-bold text-gray-800">Contact</p>
        <p className="text-gray-500">
          Spotted an error, know of a missing location, or want to report a problem with a listed place?{" "}
          <a
            href="mailto:transsafetravels@gmail.com"
            className="text-blue-600 hover:underline"
          >
            transsafetravels@gmail.com
          </a>
        </p>
      </div>
      <div className="pt-2 text-xs text-gray-400">
        <p>Data is provided for informational purposes only and does not constitute legal advice.</p>
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
          onTouchStart={onDragHandleTouchStart}
          className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-400/60 z-20 transition-colors"
          title="Drag to resize"
        />
        <div className="px-5 py-4 border-b border-gray-200 shrink-0">
          <h2 className="font-semibold text-gray-900 text-lg">About TransSafeTravels</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm text-gray-700 leading-relaxed">
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
          ${mobileDragging ? "" : mobileExpanded ? "h-[70vh]" : "h-14"}
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
            <h2 className="font-semibold text-gray-900 text-base">About TransSafeTravels</h2>
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

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2 space-y-4 text-sm text-gray-700 leading-relaxed">
          {content}
        </div>
      </div>
    </>
  );
}
