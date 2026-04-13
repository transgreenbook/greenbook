"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useMapStore } from "@/store/mapStore";
import { geocode as geocodePlace } from "@/lib/geocoding";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeocodingResult {
  type: "geocoding";
  label: string;
  lng: number;
  lat: number;
}

interface POIResult {
  type: "poi";
  id: number;
  title: string;
  description: string | null;
  lng: number;
  lat: number;
  tags: string[] | null;
  category_id: number | null;
  is_verified: boolean;
}

type SearchResult = GeocodingResult | POIResult;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flyTo = useMapStore((s) => s.flyTo);
  const setSelectedPOI = useMapStore((s) => s.setSelectedPOI);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    // Cancel previous requests
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);

    try {
      const [geoResults, poiData] = await Promise.allSettled([
        geocodePlace(q, signal).then((res) => res.map((r) => ({ type: "geocoding" as const, ...r }))),
        supabase.rpc("search_pois", { query: q }),
      ]);

      if (signal.aborted) return;

      const geo: GeocodingResult[] =
        geoResults.status === "fulfilled" ? geoResults.value : [];

      const pois: POIResult[] =
        poiData.status === "fulfilled" && poiData.value.data
          ? poiData.value.data.map(
              (row: {
                id: number;
                title: string;
                description: string | null;
                lng: number;
                lat: number;
                tags: string[] | null;
                category_id: number | null;
                is_verified: boolean;
              }) => ({
                type: "poi" as const,
                ...row,
              })
            )
          : [];

      setResults([...pois, ...geo]);
      setOpen(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 250);
  }

  function handleSelect(result: SearchResult) {
    setQuery(result.type === "poi" ? result.title : result.label);
    setOpen(false);

    if (result.type === "poi") {
      flyTo({ lng: result.lng, lat: result.lat, zoom: 14 });
      setSelectedPOI({
        id: result.id,
        title: result.title,
        description: result.description ?? null,
        long_description: null,
        category_id: result.category_id ?? null,
        is_verified: result.is_verified,
        tags: result.tags ?? null,
        color: null,
        icon: null,
        lng: result.lng,
        lat: result.lat,
      });
    } else {
      flyTo({ lng: result.lng, lat: result.lat, zoom: 12 });
    }
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setOpen(false);
    abortRef.current?.abort();
  }

  const pois = results.filter((r): r is POIResult => r.type === "poi");
  const places = results.filter((r): r is GeocodingResult => r.type === "geocoding");

  return (
    <div
      ref={containerRef}
      className="absolute top-3 left-3 z-10 w-72"
    >
      {/* Input */}
      <div className="flex items-center bg-white rounded-lg shadow-md border border-gray-200 px-3 h-10">
        <svg
          className="w-4 h-4 text-gray-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search places or POIs…"
          className="flex-1 ml-2 text-sm text-gray-800 placeholder-gray-400 bg-transparent focus:outline-none"
          suppressHydrationWarning
        />
        {loading && (
          <span className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
        )}
        {!loading && query && (
          <button
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden max-h-80 overflow-y-auto">
          {places.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                Places
              </div>
              {places.map((r, i) => (
                <button
                  key={`geo-${i}`}
                  onMouseDown={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50"
                >
                  <div className="text-sm text-gray-800 truncate">{r.label}</div>
                </button>
              ))}
            </>
          )}

          {pois.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                Points of Interest
              </div>
              {pois.map((r) => (
                <button
                  key={`poi-${r.id}`}
                  onMouseDown={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0"
                >
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {r.title}
                  </div>
                  {r.description && (
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      {r.description}
                    </div>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {open && query.length >= 2 && !loading && results.length === 0 && (
        <div className="mt-1 bg-white rounded-lg shadow-md border border-gray-200 px-3 py-3 text-sm text-gray-400">
          No results found.
        </div>
      )}
    </div>
  );
}
