import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import type { FilterSpecification } from "maplibre-gl";
import { useFilterStore } from "@/store/filterStore";

export function useMapFilter(map: maplibregl.Map | null) {
  const categories        = useFilterStore((s) => s.categories);
  const hiddenCategoryIds = useFilterStore((s) => s.hiddenCategoryIds);
  const loadCategories    = useFilterStore((s) => s.loadCategories);

  // Load category list once the map is ready
  useEffect(() => {
    if (!map) return;
    loadCategories();
  }, [map]);

  // Reapply layer filters whenever the hidden set changes
  useEffect(() => {
    if (!map) return;

    const hidden = hiddenCategoryIds;
    const hiddenIcons = categories
      .filter((c) => hiddenCategoryIds.includes(c.id))
      .map((c) => c.icon ?? c.icon_slug);

    const conditions: FilterSpecification[] = [];
    if (hidden.length > 0)
      conditions.push(["in", ["get", "category_id"], ["literal", hidden]] as FilterSpecification);
    if (hiddenIcons.length > 0)
      conditions.push(["in", ["get", "icon"], ["literal", hiddenIcons]] as FilterSpecification);

    const exclude: FilterSpecification | null = conditions.length > 0
      ? ["!", conditions.length === 1 ? conditions[0] : ["any", ...conditions] as FilterSpecification] as FilterSpecification
      : null;

    if (map.getLayer("pois-unclustered")) {
      map.setFilter(
        "pois-unclustered",
        exclude
          ? ["all", ["!", ["has", "point_count"]], exclude] as FilterSpecification
          : ["!", ["has", "point_count"]] as FilterSpecification,
      );
    }

    if (map.getLayer("pois-unclustered-icons")) {
      map.setFilter(
        "pois-unclustered-icons",
        exclude
          ? ["all", ["!", ["has", "point_count"]], ["to-boolean", ["get", "icon"]], exclude] as FilterSpecification
          : ["all", ["!", ["has", "point_count"]], ["to-boolean", ["get", "icon"]]] as FilterSpecification,
      );
    }

    if (map.getLayer("pois-along-route")) {
      map.setFilter("pois-along-route", exclude ?? null);
    }
  }, [map, hiddenCategoryIds, categories]);
}
