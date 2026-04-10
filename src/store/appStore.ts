import { create } from "zustand";

export type AppMode = "map" | "route" | "poi" | "about";

interface AppStore {
  mode: AppMode;
  previousMode: "map" | "route";
  setMode: (mode: AppMode) => void;
  /** Switch to POI detail, remembering where to go back to. */
  openPOI: (from?: "map" | "route") => void;
  /** Return to the mode that was active before POI detail was opened. */
  closePOI: () => void;
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
}));
