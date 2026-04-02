import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/store/mapStore";

const EMPTY_STATE_FILTER  = ["==", ["get", "STUSPS"], ""] as unknown as maplibregl.FilterSpecification;
const EMPTY_COUNTY_FILTER = ["==", ["get", "GEOID"],  ""] as unknown as maplibregl.FilterSpecification;
const EMPTY_CITY_FILTER   = ["all", ["==", ["get", "NAME"], ""], ["==", ["get", "STATEFP"], ""]] as unknown as maplibregl.FilterSpecification;

export function useRegionHighlight(map: maplibregl.Map | null) {
  const selectedRegion = useMapStore((s) => s.selectedRegion);

  useEffect(() => {
    if (!map) return;

    // Reset all highlights
    if (map.getLayer("states-highlight"))   map.setFilter("states-highlight",   EMPTY_STATE_FILTER);
    if (map.getLayer("counties-highlight")) map.setFilter("counties-highlight", EMPTY_COUNTY_FILTER);
    if (map.getLayer("cities-highlight"))   map.setFilter("cities-highlight",   EMPTY_CITY_FILTER);

    if (!selectedRegion) return;

    if (selectedRegion.type === "state" && selectedRegion.stateAbbr) {
      if (map.getLayer("states-highlight")) {
        map.setFilter("states-highlight", ["==", ["get", "STUSPS"], selectedRegion.stateAbbr] as unknown as maplibregl.FilterSpecification);
      }
    } else if (selectedRegion.type === "county" && selectedRegion.fips5) {
      if (map.getLayer("counties-highlight")) {
        map.setFilter("counties-highlight", ["==", ["get", "GEOID"], selectedRegion.fips5] as unknown as maplibregl.FilterSpecification);
      }
    } else if (selectedRegion.type === "city" && selectedRegion.statefp) {
      if (map.getLayer("cities-highlight")) {
        map.setFilter("cities-highlight", [
          "all",
          ["==", ["get", "NAME"],    selectedRegion.name],
          ["==", ["get", "STATEFP"], selectedRegion.statefp],
        ] as unknown as maplibregl.FilterSpecification);
      }
    }
  }, [map, selectedRegion]);
}
