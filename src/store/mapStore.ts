import { create } from "zustand";
import type { POIProperties, Bounds } from "@/hooks/usePOIs";

interface SelectedPOI extends POIProperties {
  lng: number;
  lat: number;
}

export type RegionType = "state" | "county" | "city" | "reservation";

export interface SelectedRegion {
  type: RegionType;
  name: string;
  // state:       stateAbbr (STUSPS, e.g. "CA")
  // county:      fips5 (GEOID, e.g. "06037")
  // city:        name + statefp (NAME + STATEFP, e.g. "Los Angeles" + "06")
  // reservation: geoid (AIANNHCE, 4-digit, e.g. "0555")
  stateAbbr?: string;
  fips5?: string;
  statefp?: string;
  geoid?: string;
  // Bounding box of the region at click time — used to spatially query point POIs
  // without relying on DB geometry columns that may be unpopulated.
  bounds?: [[number, number], [number, number]];
}

interface FlyToTarget {
  lng: number;
  lat: number;
  zoom?: number;
  bounds?: [[number, number], [number, number]];
}

interface MapStore {
  selectedPOI: SelectedPOI | null;
  setSelectedPOI: (poi: SelectedPOI | null) => void;
  selectedRegion: SelectedRegion | null;
  setSelectedRegion: (region: SelectedRegion | null) => void;
  boxSelectionBounds: Bounds | null;
  setBoxSelectionBounds: (bounds: Bounds | null) => void;
  boxSelectionPois: Array<{
    id: number; lng: number; lat: number; color: string | null;
    title: string; description: string | null; category_id: number | null;
    is_verified: boolean; tags: string[] | null; icon: string | null;
  }>;
  setBoxSelectionPois: (pois: MapStore["boxSelectionPois"]) => void;
  // POIs for the currently-selected region — drives the pois-region map layer.
  regionPois: Array<{
    id: number; lng: number; lat: number; color: string | null;
    title: string; description: string | null; category_id: number | null;
    is_verified: boolean; tags: string[] | null; icon: string | null;
  }>;
  setRegionPois: (pois: MapStore["regionPois"]) => void;
  pendingFlyTo: FlyToTarget | null;
  flyTo: (target: FlyToTarget) => void;
  clearFlyTo: () => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedPOI: null,
  setSelectedPOI: (poi) => set({ selectedPOI: poi }),
  selectedRegion: null,
  setSelectedRegion: (region) => set({ selectedRegion: region, regionPois: [] }),
  boxSelectionBounds: null,
  setBoxSelectionBounds: (bounds) => set({ boxSelectionBounds: bounds, boxSelectionPois: [] }),
  boxSelectionPois: [],
  setBoxSelectionPois: (pois) => set({ boxSelectionPois: pois }),
  regionPois: [],
  setRegionPois: (pois) => set({ regionPois: pois }),
  pendingFlyTo: null,
  flyTo: (target) => set({ pendingFlyTo: target }),
  clearFlyTo: () => set({ pendingFlyTo: null }),
}));
