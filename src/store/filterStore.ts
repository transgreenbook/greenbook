import { create } from "zustand";
import { supabase } from "@/lib/supabase";

export interface Category {
  id: number;
  name: string;
  color: string | null;
  icon_slug: string;
  /** Exact POI icon value (e.g. "poi-restroom"). Use this for icon-based
   *  filtering when a POI has no category_id. Falls back to icon_slug. */
  icon: string | null;
}

interface FilterStore {
  categories: Category[];
  hiddenCategoryIds: number[];
  loadCategories: () => Promise<void>;
  toggleCategory: (id: number) => void;
  showAll: () => void;
}

export const useFilterStore = create<FilterStore>((set, get) => ({
  categories: [],
  hiddenCategoryIds: [],

  loadCategories: async () => {
    if (get().categories.length > 0) return; // already loaded
    const { data } = await supabase
      .from("categories")
      .select("id, name, color, icon_slug, icon")
      .eq("map_visible", true)
      .order("name");
    if (data) set({ categories: data as Category[] });
  },

  toggleCategory: (id) =>
    set((s) => ({
      hiddenCategoryIds: s.hiddenCategoryIds.includes(id)
        ? s.hiddenCategoryIds.filter((c) => c !== id)
        : [...s.hiddenCategoryIds, id],
    })),

  showAll: () => set({ hiddenCategoryIds: [] }),
}));
