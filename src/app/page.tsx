import MapLoader from "@/components/MapLoader";
import POIPanel from "@/components/POIPanel";
import SearchBar from "@/components/SearchBar";
import RoutingPanel from "@/components/RoutingPanel";
import RouteResults from "@/components/RouteResults";
import DirectionsToggle from "@/components/DirectionsToggle";

export default function Home() {
  return (
    <main className="flex flex-col flex-1 min-h-0">
      <header className="shrink-0 h-12 px-4 flex items-center justify-between bg-white border-b border-gray-200 z-10">
        <span className="font-semibold text-gray-800 tracking-wide">TransGreenbook</span>
        <DirectionsToggle />
      </header>
      <div className="flex-1 relative min-h-0">
        <MapLoader />
        <SearchBar />
        <RoutingPanel />
        <POIPanel />
      </div>
      <RouteResults />
    </main>
  );
}
