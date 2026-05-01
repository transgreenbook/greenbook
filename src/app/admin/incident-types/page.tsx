"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type IncidentTypeConfig = {
  incident_type: string;
  severity_weight: number;
  label: string;
  description: string | null;
};

function severityColor(weight: number): string {
  if (weight >= 8) return "bg-red-100 text-red-800";
  if (weight >= 5) return "bg-orange-100 text-orange-800";
  if (weight >= 3) return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-600";
}

export default function IncidentTypesPage() {
  const [types, setTypes] = useState<IncidentTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, Partial<IncidentTypeConfig>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("incident_type_config")
      .select("*")
      .order("severity_weight", { ascending: false })
      .then(({ data }) => {
        setTypes(data ?? []);
        setLoading(false);
      });
  }, []);

  function setEdit(type: string, field: keyof IncidentTypeConfig, value: string | number) {
    setEdits((e) => ({ ...e, [type]: { ...e[type], [field]: value } }));
  }

  function isDirty(type: string) {
    return !!edits[type] && Object.keys(edits[type]).length > 0;
  }

  async function save(incidentType: string) {
    const patch = edits[incidentType];
    if (!patch) return;
    setSaving(incidentType);
    const { error } = await supabase
      .from("incident_type_config")
      .update(patch)
      .eq("incident_type", incidentType);
    setSaving(null);
    if (!error) {
      setTypes((ts) =>
        ts.map((t) =>
          t.incident_type === incidentType ? { ...t, ...patch } : t
        ).sort((a, b) => b.severity_weight - a.severity_weight)
      );
      setEdits((e) => {
        const next = { ...e };
        delete next[incidentType];
        return next;
      });
      setSaved(incidentType);
      setTimeout(() => setSaved(null), 2000);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-800">Incident Types</h1>
        <p className="text-sm text-gray-500 mt-1">
          Severity weights control heat map intensity. Higher weight = more prominent on the map.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Label</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Description</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium w-24">Weight</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {types.map((t) => {
              const current = { ...t, ...edits[t.incident_type] };
              const dirty = isDirty(t.incident_type);
              return (
                <tr key={t.incident_type} className={dirty ? "bg-yellow-50" : "hover:bg-gray-50"}>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${severityColor(current.severity_weight)}`}>
                      {t.incident_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={current.label}
                      onChange={(e) => setEdit(t.incident_type, "label", e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={current.description ?? ""}
                      onChange={(e) => setEdit(t.incident_type, "description", e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={current.severity_weight}
                      onChange={(e) => setEdit(t.incident_type, "severity_weight", parseFloat(e.target.value))}
                      className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {saved === t.incident_type ? (
                      <span className="text-green-600 text-xs font-medium">Saved ✓</span>
                    ) : (
                      <button
                        onClick={() => save(t.incident_type)}
                        disabled={!dirty || saving === t.incident_type}
                        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-30 disabled:cursor-default"
                      >
                        {saving === t.incident_type ? "Saving…" : "Save"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
