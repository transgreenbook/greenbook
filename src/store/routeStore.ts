import { create } from "zustand";
import type { RouteWaypoint, RouteResult } from "@/lib/routing";
import type { POIProperties } from "@/hooks/usePOIs";
import { useMapStore } from "@/store/mapStore";

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
  // Buffer slider state
  baseBufferMeters: number | null;
  midLat: number | null;
  bufferMultiplier: number; // 0–200, default 100 (= 1× scale bar distance)
  isLoading: boolean;
  error: string | null;

  setRoutingMode: (on: boolean) => void;
  setStart: (wp: RouteWaypoint | null) => void;
  setEnd: (wp: RouteWaypoint | null) => void;
  setRoute: (route: RouteResult | null) => void;
  setPoisAlongRoute: (pois: RoutePOI[]) => void;
  setRouteBuffer: (label: string | null) => void;
  setBaseBufferMeters: (m: number | null) => void;
  setMidLat: (lat: number | null) => void;
  setBufferMultiplier: (v: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearRoute: () => void;
  fitToRoute: () => void;
}

export const useRouteStore = create<RouteStore>((set) => ({
  isRoutingMode: false,
  start: null,
  end: null,
  route: null,
  poisAlongRoute: [],
  routeBuffer: null,
  baseBufferMeters: null,
  midLat: null,
  bufferMultiplier: 100,
  isLoading: false,
  error: null,

  setRoutingMode: (on) => set({ isRoutingMode: on }),
  setStart: (wp) => set({ start: wp, route: null, poisAlongRoute: [], routeBuffer: null, baseBufferMeters: null, midLat: null }),
  setEnd: (wp) => set({ end: wp, route: null, poisAlongRoute: [], routeBuffer: null, baseBufferMeters: null, midLat: null }),
  setRoute: (route) => set({ route }),
  setPoisAlongRoute: (pois) => set({ poisAlongRoute: pois }),
  setRouteBuffer: (label) => set({ routeBuffer: label }),
  setBaseBufferMeters: (m) => set({ baseBufferMeters: m }),
  setMidLat: (lat) => set({ midLat: lat }),
  setBufferMultiplier: (v) => set({ bufferMultiplier: v }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  clearRoute: () =>
    set({
      start: null,
      end: null,
      route: null,
      poisAlongRoute: [],
      routeBuffer: null,
      baseBufferMeters: null,
      midLat: null,
      bufferMultiplier: 100,
      error: null,
      isLoading: false,
    }),
  fitToRoute: () => {
    const { route } = useRouteStore.getState();
    if (!route || route.coordinates.length < 2) return;
    const lngs = route.coordinates.map(([lng]) => lng);
    const lats = route.coordinates.map(([, lat]) => lat);
    useMapStore.getState().flyTo({
      lng: 0, lat: 0, // ignored when bounds is set
      bounds: [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
    });
  },
}));
