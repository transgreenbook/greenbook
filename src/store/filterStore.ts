import { create } from "zustand";
import { supabase } from "@/lib/supabase";

export interface Category {
  id: number;
  name: string;
  color: string | null;
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
      .select("id, name, color")
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
