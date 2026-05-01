"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type WatchItem = {
  id: number;
  item_type: string;
  title: string;
  description: string | null;
  jurisdiction_type: string;
  status: string;
  next_check_date: string | null;
  source_url: string | null;
  source_name: string | null;
  linked_poi_id: number | null;
  severity_impact: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  finding_count?: number;
};

type Tab = "monitoring" | "resolved" | "all";

const STATUS_OPTIONS = ["monitoring", "resolved", "stale", "escalated"];

const ITEM_TYPE_LABELS: Record<string, string> = {
  bill:            "Bill",
  lawsuit:         "Lawsuit",
  executive_order: "Executive Order",
  regulation:      "Regulation",
  policy:          "Policy",
  event:           "Event",
};

function isOverdue(item: WatchItem): boolean {
  if (!item.next_check_date || item.status !== "monitoring") return false;
  return new Date(item.next_check_date) < new Date();
}

function typeColor(type: string): string {
  switch (type) {
    case "bill":            return "bg-blue-100 text-blue-800";
    case "lawsuit":         return "bg-purple-100 text-purple-800";
    case "executive_order": return "bg-red-100 text-red-800";
    case "regulation":      return "bg-orange-100 text-orange-800";
    case "policy":          return "bg-yellow-100 text-yellow-800";
    default:                return "bg-gray-100 text-gray-600";
  }
}

export default function WatchItemsPage() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("monitoring");
  const [filterType, setFilterType] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, Partial<WatchItem>>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("watch_items")
      .select("*")
      .order("next_check_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (tab === "monitoring") query = query.eq("status", "monitoring");
    else if (tab === "resolved") query = query.eq("status", "resolved");
    if (filterType) query = query.eq("item_type", filterType);

    const { data } = await query;
    if (!data) { setLoading(false); return; }

    // Fetch finding counts for each item
    const withCounts = await Promise.all(
      data.map(async (item) => {
        const { count } = await supabase
          .from("digest_findings")
          .select("id", { count: "exact", head: true })
          .eq("watch_item_id", item.id);
        return { ...item, finding_count: count ?? 0 };
      })
    );

    setItems(withCounts);
    setLoading(false);
  }, [tab, filterType]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function setEdit<K extends keyof WatchItem>(id: number, field: K, value: WatchItem[K]) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], [field]: value } }));
  }

  async function saveItem(id: number) {
    const patch = edits[id];
    if (!patch) return;
    setSaving(id);
    const { error } = await supabase.from("watch_items").update(patch).eq("id", id);
    setSaving(null);
    if (!error) {
      setEdits((e) => { const n = { ...e }; delete n[id]; return n; });
      setSaved(id);
      setTimeout(() => setSaved(null), 2000);
      fetchItems();
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "monitoring", label: "Monitoring" },
    { key: "resolved",   label: "Resolved" },
    { key: "all",        label: "All" },
  ];

  const overdueCount = items.filter(isOverdue).length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-800">Watch Items</h1>
        <p className="text-sm text-gray-500 mt-1">
          Bills, lawsuits, and policies flagged for ongoing monitoring. Items with a past check date need review.
        </p>
        {overdueCount > 0 && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
            <span className="font-semibold">{overdueCount}</span> overdue for check-in
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-sm border border-gray-300 rounded px-3 py-1.5 text-gray-700"
        >
          <option value="">All types</option>
          {Object.entries(ITEM_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">No watch items found.</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Title</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Jurisdiction</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Next check</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Findings</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => {
                const overdue = isOverdue(item);
                const isExpanded = expanded === item.id;
                const current = { ...item, ...edits[item.id] };
                const dirty = !!edits[item.id];
                return (
                  <>
                    <tr
                      key={item.id}
                      onClick={() => setExpanded(isExpanded ? null : item.id)}
                      className={`cursor-pointer ${overdue ? "bg-orange-50 hover:bg-orange-100" : dirty ? "bg-yellow-50" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeColor(item.item_type)}`}>
                          {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs">
                        <div className="truncate">{item.title}</div>
                        {item.source_url && (
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {item.source_name ?? "Source →"}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {item.jurisdiction_type}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.next_check_date ? (
                          <span className={overdue ? "text-orange-600 font-semibold" : "text-gray-500"}>
                            {overdue && "⚠ "}
                            {new Date(item.next_check_date + "T00:00:00").toLocaleDateString(undefined, {
                              month: "short", day: "numeric", year: "numeric",
                            })}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          item.status === "monitoring" ? "bg-green-100 text-green-700" :
                          item.status === "resolved"   ? "bg-gray-100 text-gray-500" :
                          item.status === "escalated"  ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {item.finding_count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-gray-300 text-xs">{isExpanded ? "▲" : "▼"}</span>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${item.id}-detail`} className="bg-blue-50">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-4 max-w-3xl">
                            {item.description && (
                              <p className="text-sm text-gray-700">{item.description}</p>
                            )}
                            {item.severity_impact && (
                              <p className="text-sm text-gray-600">
                                <span className="font-medium">Severity impact:</span> {item.severity_impact}
                              </p>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Status</label>
                                <select
                                  value={current.status}
                                  onChange={(e) => setEdit(item.id, "status", e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                                >
                                  {STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Next check date</label>
                                <input
                                  type="date"
                                  value={current.next_check_date ?? ""}
                                  onChange={(e) => setEdit(item.id, "next_check_date", e.target.value || null)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                                />
                              </div>
                            </div>

                            <div className="flex gap-2 items-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); saveItem(item.id); }}
                                disabled={!dirty || saving === item.id}
                                className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-30 disabled:cursor-default"
                              >
                                {saving === item.id ? "Saving…" : "Save changes"}
                              </button>
                              {saved === item.id && (
                                <span className="text-green-600 text-sm">Saved ✓</span>
                              )}
                              {item.linked_poi_id && (
                                <a
                                  href={`/admin/pois`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm text-blue-600 hover:underline ml-2"
                                >
                                  Linked POI #{item.linked_poi_id} →
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
