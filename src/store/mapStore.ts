import { create } from "zustand";
import type { POIProperties } from "@/hooks/usePOIs";

interface SelectedPOI extends POIProperties {
  lng: number;
  lat: number;
}

interface FlyToTarget {
  lng: number;
  lat: number;
  zoom?: number;
}

interface MapStore {
  selectedPOI: SelectedPOI | null;
  setSelectedPOI: (poi: SelectedPOI | null) => void;
  pendingFlyTo: FlyToTarget | null;
  flyTo: (target: FlyToTarget) => void;
  clearFlyTo: () => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedPOI: null,
  setSelectedPOI: (poi) => set({ selectedPOI: poi }),
  pendingFlyTo: null,
  flyTo: (target) => set({ pendingFlyTo: target }),
  clearFlyTo: () => set({ pendingFlyTo: null }),
}));
