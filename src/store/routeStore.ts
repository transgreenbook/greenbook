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
  routeBuffer: string | null;
  isLoading: boolean;
  error: string | null;

  setRoutingMode: (on: boolean) => void;
  setStart: (wp: RouteWaypoint | null) => void;
  setEnd: (wp: RouteWaypoint | null) => void;
  setRoute: (route: RouteResult | null) => void;
  setPoisAlongRoute: (pois: RoutePOI[]) => void;
  setRouteBuffer: (label: string | null) => void;
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
  routeBuffer: null,
  isLoading: false,
  error: null,

  setRoutingMode: (on) => set({ isRoutingMode: on }),
  setStart: (wp) => set({ start: wp, route: null, poisAlongRoute: [], routeBuffer: null }),
  setEnd: (wp) => set({ end: wp, route: null, poisAlongRoute: [], routeBuffer: null }),
  setRoute: (route) => set({ route }),
  setPoisAlongRoute: (pois) => set({ poisAlongRoute: pois }),
  setRouteBuffer: (label) => set({ routeBuffer: label }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  clearRoute: () =>
    set({
      start: null,
      end: null,
      route: null,
      poisAlongRoute: [],
      routeBuffer: null,
      error: null,
      isLoading: false,
    }),
}));
