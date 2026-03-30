"use client";

import { useMapStore } from "@/store/mapStore";

export default function POIPanel() {
  const { selectedPOI, setSelectedPOI } = useMapStore();

  if (!selectedPOI) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-lg z-10 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-800 text-base truncate pr-2">
          {selectedPOI.title}
        </h2>
        <button
          onClick={() => setSelectedPOI(null)}
          className="shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
      </div>
    </div>
  );
}
