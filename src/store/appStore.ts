import { create } from "zustand";

export type AppMode = "map" | "route" | "poi" | "about";

interface PanelWidths {
  route: number;
  poi: number;
  about: number;
}

interface AppStore {
  mode: AppMode;
  previousMode: "map" | "route";
  setMode: (mode: AppMode) => void;
  /** Switch to POI detail, remembering where to go back to. */
  openPOI: (from?: "map" | "route") => void;
  /** Return to the mode that was active before POI detail was opened. */
  closePOI: () => void;
  panelWidths: PanelWidths;
  setPanelWidth: (panel: keyof PanelWidths, width: number) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  mode: "map",
  previousMode: "map",

  setMode: (mode) => set({ mode }),

  openPOI: (from) =>
    set((s) => ({
      mode: "poi",
      previousMode: from ?? (s.mode === "route" ? "route" : "map"),
    })),

  closePOI: () => set((s) => ({ mode: s.previousMode })),

  panelWidths: { route: 320, poi: 320, about: 320 },
  setPanelWidth: (panel, width) =>
    set((s) => ({ panelWidths: { ...s.panelWidths, [panel]: width } })),
}));
