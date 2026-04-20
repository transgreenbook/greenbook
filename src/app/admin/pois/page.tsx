"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type POI = {
  id: number;
  title: string;
  is_verified: boolean;
  created_at: string;
  category_id: number | null;
  category_name: string | null;
  source: string | null;
};

type Category = { id: number; name: string; color: string | null };

export default function AdminPOIsPage() {
  const [pois,       setPois]       = useState<POI[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [hiddenIds,  setHiddenIds]  = useState<number[]>([]);
  const [loading,    setLoading]    = useState(true);

  async function fetchPOIs() {
    const [{ data: poiData }, { data: catData }] = await Promise.all([
      supabase
        .from("points_of_interest")
        .select("id, title, is_verified, created_at, category_id, categories(name), source")
        .not("source", "in", '("refuge_restrooms","lgbtq_venues")')
        .order("created_at", { ascending: false }),
      supabase
        .from("categories")
        .select("id, name, color")
        .order("name"),
    ]);

    setPois(
      (poiData ?? []).map((p: Record<string, unknown>) => ({
        id:            p.id as number,
        title:         p.title as string,
        is_verified:   p.is_verified as boolean,
        created_at:    p.created_at as string,
        category_id:   p.category_id as number | null,
        category_name: (p.categories as { name: string } | null)?.name ?? null,
        source:        p.source as string | null,
      }))
    );
    setCategories(catData ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchPOIs(); }, []);

  async function toggleVerified(id: number, current: boolean) {
    await supabase
      .from("points_of_interest")
      .update({ is_verified: !current })
      .eq("id", id);
    setPois((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_verified: !current } : p))
    );
  }

  async function deletePOI(id: number) {
    if (!confirm("Delete this POI? This cannot be undone.")) return;
    await supabase.from("points_of_interest").delete().eq("id", id);
    setPois((prev) => prev.filter((p) => p.id !== id));
  }

  const visiblePois = hiddenIds.length === 0
    ? pois
    : pois.filter((p) => p.category_id === null || !hiddenIds.includes(p.category_id));

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-800">
          Points of Interest
        </h1>
        <Link
          href="/admin/pois/new"
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
        >
          + New POI
        </Link>
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-medium text-gray-500">Filter by category</span>
          {categories.map((cat) => {
            const hidden = hiddenIds.includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() =>
                  setHiddenIds((prev) =>
                    prev.includes(cat.id)
                      ? prev.filter((id) => id !== cat.id)
                      : [...prev, cat.id]
                  )
                }
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  hidden
                    ? "bg-white border-gray-200 text-gray-300"
                    : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: hidden ? "#e5e7eb" : (cat.color ?? "#3b82f6") }}
                />
                {cat.name}
              </button>
            );
          })}
          {hiddenIds.length === 0 ? (
            <button
              type="button"
              onClick={() => setHiddenIds(categories.map((c) => c.id))}
              className="text-xs text-blue-600 hover:underline"
            >
              Clear All
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setHiddenIds([])}
              className="text-xs text-blue-600 hover:underline"
            >
              Show All
            </button>
          )}
          <span className="text-xs text-gray-400 ml-1">
            {visiblePois.length} of {pois.length}
          </span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-right px-4 py-3 text-gray-400 font-medium w-10">#</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Title</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Category</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visiblePois.map((poi, i) => (
              <tr key={poi.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  <Link href={`/admin/pois/${poi.id}/edit`} className="hover:text-blue-600 hover:underline">
                    {poi.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500">{poi.category_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleVerified(poi.id, poi.is_verified)}
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      poi.is_verified
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {poi.is_verified ? "Verified" : "Unverified"}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(poi.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3 justify-end">
                    <Link
                      href={`/admin/pois/${poi.id}/edit`}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => deletePOI(poi.id)}
                      className="text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visiblePois.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No POIs match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
