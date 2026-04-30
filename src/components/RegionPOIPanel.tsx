"use client";

import { useState, useEffect, useMemo } from "react";
import { useMobileSheet } from "@/hooks/useMobileSheet";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import { useAppStore } from "@/store/appStore";
import { useRegionPOIs } from "@/hooks/useRegionPOIs";
import type { RegionPOI } from "@/hooks/useRegionPOIs";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useFilterStore } from "@/store/filterStore";
import POIFilter from "@/components/POIFilter";
import { severityColor } from "@/hooks/useRegionColors";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const POI_ICON_MAP: Record<string, { url: string; fill: string }> = {
  "poi-restroom":  { url: `${basePath}/icons/transgender-symbol.svg`,        fill: "#1e40af" },
  "poi-nightlife": { url: `${basePath}/icons/martini-glass-with-straw.svg`,  fill: "#9333ea" },
};

const REGION_LABEL: Record<string, string> = {
  state:       "State",
  county:      "County",
  city:        "City",
  reservation: "Tribal Nation",
};

// Categories whose icon_slug prefix causes them to be merged into a single group.
const MERGE_GROUPS: Array<{ prefix: string; name: string }> = [
  { prefix: "law-",           name: "Law" },
  { prefix: "policy-rating-", name: "Policy" },
];

function mergeGroupName(iconSlug: string | null | undefined): string | null {
  if (!iconSlug) return null;
  return MERGE_GROUPS.find((mg) => iconSlug.startsWith(mg.prefix))?.name ?? null;
}

// Categories that always start expanded regardless of count or severity.
const ALWAYS_EXPANDED_SLUGS = new Set([
  "safety-incident",
  "restaurant",
  "trans-camping",
  "trans-lodging",
  "trans-shelter",
]);

function isAlwaysExpanded(iconSlug: string | null | undefined): boolean {
  if (!iconSlug) return false;
  if (ALWAYS_EXPANDED_SLUGS.has(iconSlug)) return true;
  // Merged groups (Law, Policy) are always expanded
  return MERGE_GROUPS.some((mg) => iconSlug.startsWith(mg.prefix));
}

// Severity threshold above which a category auto-expands even if it would
// otherwise be collapsed (e.g. a high-severity restroom in a red state).
const SEVERITY_AUTO_EXPAND = 5;

type POIGroup = {
  groupKey: string;       // unique key — merge group name, stringified catId, or "uncategorized"
  name: string;
  iconSlug: string | null;
  pois: RegionPOI[];
  maxAbsSeverity: number;
  dominantSeverity: number; // signed severity of the highest-|severity| item
  defaultExpanded: boolean;
};

export default function RegionPOIPanel() {
  const { selectedRegion, setSelectedRegion, setSelectedPOI, flyTo } = useMapStore();
  const setRegionPois = useMapStore((s) => s.setRegionPois);
  const isRoutingMode = useRouteStore((s) => s.isRoutingMode);
  const openPOI = useAppStore((s) => s.openPOI);
  const { data: pois, isLoading } = useRegionPOIs(selectedRegion);

  // Sync loaded POIs to the map source so only region POIs appear as dots.
  useEffect(() => {
    if (pois) {
      setRegionPois(pois.map((p) => ({
        id: p.id, lng: p.lng, lat: p.lat, color: p.color,
        title: p.title, description: p.description,
        category_id: p.category_id, is_verified: p.is_verified,
        tags: p.tags, icon: p.icon,
      })));
    }
  }, [pois, setRegionPois]);

  const categories        = useFilterStore((s) => s.categories);
  const hiddenCategoryIds = useFilterStore((s) => s.hiddenCategoryIds);
  const filtersActive     = hiddenCategoryIds.length > 0;
  const hiddenCategoryIcons = categories
    .filter((c) => hiddenCategoryIds.includes(c.id))
    .map((c) => c.icon ?? c.icon_slug);

  const {
    isExpanded: mobileExpanded,
    isDragging: mobileDragging,
    sheetStyle: mobileSheetStyle,
    toggle: toggleMobile,
    handleProps: mobileHandleProps,
  } = useMobileSheet({ collapsedHeight: 80 });
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [showFilter, setShowFilter]             = useState(false);
  const { width: panelWidth, onDragHandleMouseDown } = useResizablePanel();

  // Tracks which group keys have been manually toggled from their default state.
  const [toggledCategories, setToggledCategories] = useState<Set<string>>(new Set());

  // Reset manual toggles whenever the selected region changes.
  const regionKey =
    selectedRegion?.type === "state"       ? selectedRegion.stateAbbr :
    selectedRegion?.type === "county"      ? selectedRegion.fips5 :
    selectedRegion?.type === "reservation" ? selectedRegion.geoid :
    selectedRegion?.name ?? null;
  useEffect(() => { setToggledCategories(new Set()); }, [regionKey]);

  const visiblePois = (pois?.filter((p) => {
    if (p.category_id != null) return !hiddenCategoryIds.includes(p.category_id);
    if (p.icon)                return !hiddenCategoryIcons.includes(p.icon);
    return true;
  }) ?? []);

  // Build category groups from visible POIs.
  // Categories sharing a MERGE_GROUPS prefix are collapsed into one group.
  const groups: POIGroup[] = useMemo(() => {
    if (!visiblePois.length) return [];
    const catMap = new Map(categories.map((c) => [c.id, c]));

    // Map from groupKey → accumulated POIs
    const grouped = new Map<string, RegionPOI[]>();
    for (const poi of visiblePois) {
      const cat = poi.category_id != null ? catMap.get(poi.category_id) : undefined;
      const mergedName = mergeGroupName(cat?.icon_slug);
      const key = mergedName ?? (poi.category_id != null ? String(poi.category_id) : "uncategorized");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(poi);
    }

    return Array.from(grouped.entries())
      .map(([groupKey, groupPois]) => {
        // For merged groups the key is the group name; otherwise look up the category.
        const isMerged = MERGE_GROUPS.some((mg) => mg.name === groupKey);
        const catId = (!isMerged && groupKey !== "uncategorized") ? Number(groupKey) : null;
        const cat = catId != null ? catMap.get(catId) : undefined;
        const sorted = [...groupPois].sort(
          (a, b) => Math.abs(b.severity ?? 0) - Math.abs(a.severity ?? 0),
        );
        const maxAbsSeverity = Math.abs(sorted[0]?.severity ?? 0);
        const dominantSeverity = sorted[0]?.severity ?? 0;
        const defaultExpanded =
          isMerged ||
          isAlwaysExpanded(cat?.icon_slug) ||
          groupPois.length === 1 ||
          maxAbsSeverity >= SEVERITY_AUTO_EXPAND;
        return {
          groupKey,
          name: isMerged ? groupKey : (cat?.name ?? "Other"),
          iconSlug: cat?.icon_slug ?? null,
          pois: sorted,
          maxAbsSeverity,
          dominantSeverity,
          defaultExpanded,
        };
      })
      .sort((a, b) => {
        if (a.groupKey === "uncategorized") return 1;
        if (b.groupKey === "uncategorized") return -1;
        return b.maxAbsSeverity - a.maxAbsSeverity;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pois, hiddenCategoryIds, categories]);

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

  function toggleGroup(groupKey: string) {
    setToggledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  const typeLabel = REGION_LABEL[selectedRegion.type];

  const content = (
    <>
      {selectedRegion.type === "reservation" && (
        <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 leading-snug">
          Tribal nations exercise sovereign jurisdiction. State laws may not apply here — laws and protections can differ from the surrounding state. We are still gathering data on tribal policies.
        </div>
      )}
      {isLoading && (
        <p className="text-sm text-gray-400">Loading POIs…</p>
      )}
      {!isLoading && visiblePois.length === 0 && (pois?.length ?? 0) > 0 && (
        <p className="text-sm text-gray-400">All POIs in this area are hidden by your filters.</p>
      )}
      {!isLoading && pois && pois.length === 0 && (
        <p className="text-sm text-gray-400">No POIs found for {selectedRegion.name}.</p>
      )}
      {!isLoading && groups.length > 0 && (
        <div className="-mx-4">
          {groups.map((group) => {
            const isExpanded = toggledCategories.has(group.groupKey)
              ? !group.defaultExpanded
              : group.defaultExpanded;
            const headerBg = severityColor(group.dominantSeverity, null, 60) ?? "#f3f4f6";

            return (
              <div key={group.groupKey}>
                {/* Category header */}
                <button
                  className="w-full flex items-center justify-between px-4 py-2 text-left hover:brightness-95 border-b border-black/5"
                  style={{ backgroundColor: headerBg }}
                  onClick={() => toggleGroup(group.groupKey)}
                  aria-expanded={isExpanded}
                >
                  <span className="text-sm font-semibold text-gray-800">{group.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500 tabular-nums">{group.pois.length}</span>
                    <svg
                      className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* POI rows */}
                {isExpanded && (
                  <ul>
                    {group.pois.map((poi) => (
                      <li key={poi.id}>
                        <button
                          className="w-full text-left px-4 py-2.5 border-b border-gray-50 last:border-0 flex items-start gap-3 hover:brightness-95"
                          style={{ backgroundColor: severityColor(poi.severity, null, 50) ?? undefined }}
                          onClick={() => handlePOIClick(poi)}
                        >
                          {poi.icon && POI_ICON_MAP[poi.icon] ? (
                            <span
                              className="mt-1 w-4 h-4 shrink-0"
                              style={{
                                backgroundColor: POI_ICON_MAP[poi.icon].fill,
                                WebkitMaskImage: `url(${POI_ICON_MAP[poi.icon].url})`,
                                maskImage: `url(${POI_ICON_MAP[poi.icon].url})`,
                                WebkitMaskSize: "contain",
                                maskSize: "contain",
                                WebkitMaskRepeat: "no-repeat",
                                maskRepeat: "no-repeat",
                              }}
                            />
                          ) : (
                            <span
                              className="mt-1 w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: poi.color ?? "#3b82f6" }}
                            />
                          )}
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
              </div>
            );
          })}
        </div>
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
