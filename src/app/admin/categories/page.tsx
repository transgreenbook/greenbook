"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Category = {
  id: number;
  name: string;
  icon_slug: string;
  color: string | null;
  severity_weight: number;
  map_visible: boolean;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [name,     setName]         = useState("");
  const [iconSlug, setIconSlug]     = useState("");
  const [color,    setColor]        = useState("#3b82f6");
  const [weight,   setWeight]       = useState("100");
  const [saving,   setSaving]       = useState(false);

  async function fetchCategories() {
    const { data } = await supabase
      .from("categories")
      .select("id, name, icon_slug, color, severity_weight, map_visible")
      .order("name");
    setCategories(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchCategories(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !iconSlug.trim()) return;
    setSaving(true);
    await supabase.from("categories").insert({
      name:            name.trim(),
      icon_slug:       iconSlug.trim(),
      color,
      severity_weight: parseInt(weight) || 100,
    });
    setName(""); setIconSlug(""); setColor("#3b82f6"); setWeight("100");
    await fetchCategories();
    setSaving(false);
  }

  async function updateWeight(id: number, raw: string) {
    const val = Math.max(0, Math.min(100, parseInt(raw) || 0));
    await supabase.from("categories").update({ severity_weight: val }).eq("id", id);
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, severity_weight: val } : c))
    );
  }

  async function deleteCategory(id: number) {
    if (!confirm("Delete this category? POIs assigned to it will become uncategorized.")) return;
    await supabase.from("categories").delete().eq("id", id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-gray-800 mb-6">Categories</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Icon slug</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Color</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                Severity weight
                <span className="ml-1 text-gray-400 font-normal">(0–100)</span>
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.icon_slug}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block w-5 h-5 rounded-full border border-gray-200"
                    style={{ backgroundColor: c.color ?? "#ccc" }}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={c.severity_weight}
                    key={c.severity_weight}
                    onBlur={(e) => {
                      if (parseInt(e.target.value) !== c.severity_weight) {
                        updateWeight(c.id, e.target.value);
                      }
                    }}
                    className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => deleteCategory(c.id)}
                    className="text-red-500 hover:underline text-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add Category</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border border-gray-300 rounded px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Icon slug *</label>
            <input
              type="text"
              value={iconSlug}
              onChange={(e) => setIconSlug(e.target.value)}
              required
              placeholder="hiking"
              className="border border-gray-300 rounded px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="border border-gray-300 rounded h-9 w-12 cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Severity weight
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </form>
      </div>
    </div>
  );
}
