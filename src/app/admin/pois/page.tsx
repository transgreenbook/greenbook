"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type POI = {
  id: number;
  title: string;
  is_verified: boolean;
  created_at: string;
  categories: { name: string }[] | null;
};

export default function AdminPOIsPage() {
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchPOIs() {
    const { data } = await supabase
      .from("points_of_interest")
      .select("id, title, is_verified, created_at, categories(name)")
      .is("source", null)
      .order("created_at", { ascending: false });
    setPois((data as POI[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchPOIs();
  }, []);

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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-right px-4 py-3 text-gray-400 font-medium w-10">#</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                Title
              </th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                Category
              </th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                Status
              </th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                Created
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pois.map((poi, i) => (
              <tr key={poi.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {poi.title}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {poi.categories?.[0]?.name ?? "—"}
                </td>
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
            {pois.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-gray-400"
                >
                  No POIs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
