import { create } from "zustand";
import type { POIProperties } from "@/hooks/usePOIs";

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
  pendingFlyTo: FlyToTarget | null;
  flyTo: (target: FlyToTarget) => void;
  clearFlyTo: () => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedPOI: null,
  setSelectedPOI: (poi) => set({ selectedPOI: poi }),
  selectedRegion: null,
  setSelectedRegion: (region) => set({ selectedRegion: region }),
  pendingFlyTo: null,
  flyTo: (target) => set({ pendingFlyTo: target }),
  clearFlyTo: () => set({ pendingFlyTo: null }),
}));
