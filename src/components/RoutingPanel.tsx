"use client";

import { useState, useRef, useCallback } from "react";
import { useRouteStore } from "@/store/routeStore";
import { useAppStore } from "@/store/appStore";
import { geocode, type GeocodingResult } from "@/lib/geocoding";
import { supabase } from "@/lib/supabase";

interface POIResult {
  type: "poi";
  label: string;
  lng: number;
  lat: number;
}

interface PlaceResult {
  type: "place";
  label: string;
  lng: number;
  lat: number;
}

type WaypointResult = POIResult | PlaceResult;

function WaypointInput({
  label,
  value,
  onChange,
  onSelect,
  onClear,
  placeholder,
  pinColor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: GeocodingResult) => void;
  onClear: () => void;
  placeholder: string;
  pinColor: string;
}) {
  const [pois, setPois] = useState<POIResult[]>([]);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleChange = useCallback(
    (q: string) => {
      onChange(q);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.length < 2) { setPois([]); setPlaces([]); setOpen(false); return; }
      debounceRef.current = setTimeout(async () => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const signal = abortRef.current.signal;
        try {
          const [geoRes, poiRes] = await Promise.allSettled([
            geocode(q, signal),
            supabase.rpc("search_pois", { query: q }),
          ]);

          if (signal.aborted) return;

          const newPlaces: PlaceResult[] =
            geoRes.status === "fulfilled"
              ? geoRes.value.map((r) => ({ type: "place" as const, ...r }))
              : [];

          const newPois: POIResult[] =
            poiRes.status === "fulfilled" && poiRes.value.data
              ? poiRes.value.data.map((row: { title: string; lng: number; lat: number }) => ({
                  type: "poi" as const,
                  label: row.title,
                  lng: row.lng,
                  lat: row.lat,
                }))
              : [];

          setPois(newPois);
          setPlaces(newPlaces);
          setOpen(newPois.length > 0 || newPlaces.length > 0);
        } catch { /* aborted */ }
      }, 250);
    },
    [onChange]
  );

  function handleSelect(r: WaypointResult) {
    onSelect({ label: r.label, lng: r.lng, lat: r.lat });
    onChange(r.label);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-200 px-3 h-9">
        <span className={`w-3 h-3 rounded-full shrink-0 ${pinColor}`} />
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => (pois.length > 0 || places.length > 0) && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="flex-1 ml-2 text-sm text-gray-800 placeholder-gray-400 bg-transparent focus:outline-none"
          suppressHydrationWarning
          aria-label={label}
        />
        {value && (
          <button
            onClick={() => { onChange(""); setPois([]); setPlaces([]); setOpen(false); onClear(); }}
            className="text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Clear"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div className="absolute top-full mt-0.5 left-0 right-0 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-20 max-h-60 overflow-y-auto">
          {pois.length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                Points of Interest
              </div>
              {pois.map((r, i) => (
                <button
                  key={`poi-${i}`}
                  onMouseDown={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 border-b border-gray-50 truncate"
                >
                  {r.label}
                </button>
              ))}
            </>
          )}
          {places.length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                Places
              </div>
              {places.map((r, i) => (
                <button
                  key={`place-${i}`}
                  onMouseDown={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 border-b border-gray-50 last:border-0 truncate"
                >
                  {r.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function RoutingPanel() {
  const isRoutingMode = useRouteStore((s) => s.isRoutingMode);
  const start = useRouteStore((s) => s.start);
  const end = useRouteStore((s) => s.end);
  const route = useRouteStore((s) => s.route);
  const isLoading = useRouteStore((s) => s.isLoading);
  const error = useRouteStore((s) => s.error);
  const setStart = useRouteStore((s) => s.setStart);
  const setEnd = useRouteStore((s) => s.setEnd);
  const clearRoute = useRouteStore((s) => s.clearRoute);
  const setRoutingMode = useRouteStore((s) => s.setRoutingMode);
  const setMode = useAppStore((s) => s.setMode);

  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");

  if (!isRoutingMode) return null;

  function handleClose() {
    clearRoute();
    setRoutingMode(false);
    setStartQuery("");
    setEndQuery("");
    setMode("map");
  }

  return (
    <div className="absolute top-3 left-3 z-10 w-72 space-y-1">
      {/* Panel */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-2 space-y-1.5">
        {/* Header */}
        <div className="flex items-center justify-between pb-0.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Directions</span>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close directions"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <WaypointInput
          label="Start"
          value={startQuery}
          onChange={setStartQuery}
          onSelect={(r) => setStart({ lng: r.lng, lat: r.lat, label: r.label })}
          onClear={() => setStart(null)}
          placeholder="Starting point…"
          pinColor="bg-green-500"
        />

        <WaypointInput
          label="End"
          value={endQuery}
          onChange={setEndQuery}
          onSelect={(r) => setEnd({ lng: r.lng, lat: r.lat, label: r.label })}
          onClear={() => setEnd(null)}
          placeholder="Destination…"
          pinColor="bg-red-500"
        />

        {/* Hint when map click is available */}
        {(!start || !end) && (
          <p className="text-xs text-gray-400 px-1">
            {!start ? "Set start above or click the map." : "Set destination above or click the map."}
          </p>
        )}

        {/* Status */}
        {isLoading && (
          <p className="text-xs text-blue-500 px-1">Calculating route…</p>
        )}
        {error && (
          <p className="text-xs text-red-500 px-1">{error}</p>
        )}
        {route && !isLoading && (
          <p className="text-xs font-medium text-gray-700 px-1">
            {route.distanceMiles.toFixed(1)} miles
          </p>
        )}
      </div>
    </div>
  );
}
