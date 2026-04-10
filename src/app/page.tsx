"use client";

import { useAppStore } from "@/store/appStore";
import MapLoader from "@/components/MapLoader";
import ModeToggle from "@/components/ModeToggle";
import SearchBar from "@/components/SearchBar";
import RegionPOIPanel from "@/components/RegionPOIPanel";
import RoutingPanel from "@/components/RoutingPanel";
import RoutePOIPanel from "@/components/RoutePOIPanel";
import RouteBufferSlider from "@/components/RouteBufferSlider";
import POIDetailPanel from "@/components/POIDetailPanel";
import AboutPanel from "@/components/AboutPanel";

export default function Home() {
  const mode = useAppStore((s) => s.mode);

  return (
    <main className="flex flex-col flex-1 min-h-0">
      <header className="shrink-0 h-12 px-4 flex items-center justify-between bg-white border-b border-gray-200 z-10">
        <span className="font-semibold text-gray-800 tracking-wide">TransSafeTravels</span>
        <ModeToggle />
      </header>
      <div className="flex-1 relative min-h-0">
        <MapLoader />

        {mode === "map" && (
          <>
            <SearchBar />
            <RegionPOIPanel />
          </>
        )}

        {mode === "route" && (
          <>
            <RoutingPanel />
            <RoutePOIPanel />
            <RouteBufferSlider />
          </>
        )}

        {mode === "poi" && <POIDetailPanel />}

        {mode === "about" && <AboutPanel />}
      </div>
    </main>
  );
}
