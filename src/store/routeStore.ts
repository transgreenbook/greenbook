import { create } from "zustand";
import type { RouteWaypoint, RouteResult } from "@/lib/routing";
import type { POIProperties } from "@/hooks/usePOIs";

export interface RoutePOI extends POIProperties {
  lng: number;
  lat: number;
}

interface RouteStore {
  isRoutingMode: boolean;
  start: RouteWaypoint | null;
  end: RouteWaypoint | null;
  route: RouteResult | null;
  poisAlongRoute: RoutePOI[];
  isLoading: boolean;
  error: string | null;

  setRoutingMode: (on: boolean) => void;
  setStart: (wp: RouteWaypoint | null) => void;
  setEnd: (wp: RouteWaypoint | null) => void;
  setRoute: (route: RouteResult | null) => void;
  setPoisAlongRoute: (pois: RoutePOI[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearRoute: () => void;
}

export const useRouteStore = create<RouteStore>((set) => ({
  isRoutingMode: false,
  start: null,
  end: null,
  route: null,
  poisAlongRoute: [],
  isLoading: false,
  error: null,

  setRoutingMode: (on) => set({ isRoutingMode: on }),
  setStart: (wp) => set({ start: wp, route: null, poisAlongRoute: [] }),
  setEnd: (wp) => set({ end: wp, route: null, poisAlongRoute: [] }),
  setRoute: (route) => set({ route }),
  setPoisAlongRoute: (pois) => set({ poisAlongRoute: pois }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  clearRoute: () =>
    set({
      start: null,
      end: null,
      route: null,
      poisAlongRoute: [],
      error: null,
      isLoading: false,
    }),
}));
