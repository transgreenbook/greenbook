"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Category = { id: number; name: string };

type POIFormData = {
  title: string;
  description: string;
  lat: string;
  lng: string;
  category_id: string;
  is_verified: boolean;
  tags: string;
};

type Props = {
  initialData?: Partial<POIFormData> & { id?: number };
};

const EMPTY: POIFormData = {
  title: "",
  description: "",
  lat: "",
  lng: "",
  category_id: "",
  is_verified: false,
  tags: "",
};

export default function POIForm({ initialData }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<POIFormData>({ ...EMPTY, ...initialData });
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  function set<K extends keyof POIFormData>(field: K, value: POIFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);

    if (isNaN(lat) || isNaN(lng)) {
      setError("Latitude and longitude must be valid numbers.");
      setSaving(false);
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      geom: `POINT(${lng} ${lat})`,
      category_id: form.category_id ? parseInt(form.category_id) : null,
      is_verified: form.is_verified,
      tags: form.tags
        ? form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : null,
    };

    let err;
    if (initialData?.id) {
      ({ error: err } = await supabase
        .from("points_of_interest")
        .update(payload)
        .eq("id", initialData.id));
    } else {
      ({ error: err } = await supabase
        .from("points_of_interest")
        .insert(payload));
    }

    if (err) {
      setError(err.message);
      setSaving(false);
    } else {
      router.push("/admin/pois");
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title *
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Latitude *
          </label>
          <input
            type="number"
            step="any"
            value={form.lat}
            onChange={(e) => set("lat", e.target.value)}
            required
            placeholder="37.7749"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Longitude *
          </label>
          <input
            type="number"
            step="any"
            value={form.lng}
            onChange={(e) => set("lng", e.target.value)}
            required
            placeholder="-122.4194"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Category
        </label>
        <select
          value={form.category_id}
          onChange={(e) => set("category_id", e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tags{" "}
          <span className="text-gray-400 font-normal">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={form.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="hiking, waterfall, national-park"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_verified"
          checked={form.is_verified}
          onChange={(e) => set("is_verified", e.target.checked)}
          className="rounded border-gray-300"
        />
        <label htmlFor="is_verified" className="text-sm font-medium text-gray-700">
          Verified{" "}
          <span className="text-gray-400 font-normal">(visible on map)</span>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : initialData?.id ? "Save Changes" : "Create POI"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/pois")}
          className="text-gray-600 px-4 py-2 rounded text-sm font-medium hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
