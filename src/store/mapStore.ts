import { create } from "zustand";
import type { POIProperties } from "@/hooks/usePOIs";

interface SelectedPOI extends POIProperties {
  lng: number;
  lat: number;
}

interface MapStore {
  selectedPOI: SelectedPOI | null;
  setSelectedPOI: (poi: SelectedPOI | null) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedPOI: null,
  setSelectedPOI: (poi) => set({ selectedPOI: poi }),
}));
