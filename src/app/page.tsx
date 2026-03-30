import MapLoader from "@/components/MapLoader";
import POIPanel from "@/components/POIPanel";
import SearchBar from "@/components/SearchBar";

export default function Home() {
  return (
    <main className="flex flex-col flex-1">
      <header className="shrink-0 h-12 px-4 flex items-center bg-white border-b border-gray-200 z-10">
        <span className="font-semibold text-gray-800 tracking-wide">Greenbook</span>
      </header>
      <div className="flex-1 relative">
        <MapLoader />
        <SearchBar />
        <POIPanel />
      </div>
    </main>
  );
}
