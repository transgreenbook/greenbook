"use client";

import { useEffect } from "react";
import { useFilterStore } from "@/store/filterStore";

export default function POIFilter() {
  const categories        = useFilterStore((s) => s.categories);
  const hiddenCategoryIds = useFilterStore((s) => s.hiddenCategoryIds);
  const toggleCategory    = useFilterStore((s) => s.toggleCategory);
  const showAll           = useFilterStore((s) => s.showAll);
  const loadCategories    = useFilterStore((s) => s.loadCategories);

  useEffect(() => { loadCategories(); }, []);

  if (categories.length === 0) return null;

  return (
    <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/80">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">Filter by category</span>
        {hiddenCategoryIds.length > 0 && (
          <button
            onClick={showAll}
            className="text-xs text-blue-600 hover:underline"
          >
            Show all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => {
          const isHidden = hiddenCategoryIds.includes(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              title={isHidden ? `Show ${cat.name}` : `Hide ${cat.name}`}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border transition-colors
                ${isHidden
                  ? "bg-white border-gray-200 text-gray-300"
                  : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
                }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: isHidden ? "#e5e7eb" : (cat.color ?? "#3b82f6") }}
              />
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
