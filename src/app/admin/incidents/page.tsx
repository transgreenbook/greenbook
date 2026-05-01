"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type IncidentTypeConfig = {
  incident_type: string;
  severity_weight: number;
  label: string;
};

type Incident = {
  id: number;
  title: string;
  description: string | null;
  incident_date: string | null;
  incident_type: string | null;
  jurisdiction_type: string | null;
  city: string | null;
  county_name: string | null;
  state_abbr: string | null;
  source_url: string | null;
  source_name: string | null;
  digest_finding_id: number | null;
  confidence: number | null;
  reviewed_at: string | null;
  approved_at: string | null;
  dismissed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
};

type Tab = "pending" | "approved" | "dismissed" | "all";

function severityColor(weight: number): string {
  if (weight >= 8) return "bg-red-100 text-red-800";
  if (weight >= 5) return "bg-orange-100 text-orange-800";
  if (weight >= 3) return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-600";
}

function confidenceColor(c: number): string {
  if (c >= 0.9) return "text-green-600";
  if (c >= 0.7) return "text-yellow-600";
  return "text-red-500";
}

export default function AdminIncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [typeConfigs, setTypeConfigs] = useState<Map<string, IncidentTypeConfig>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pending");
  const [filterType, setFilterType] = useState("");
  const [filterState, setFilterState] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("incident_type_config")
      .select("incident_type, severity_weight, label")
      .then(({ data }) => {
        if (data) setTypeConfigs(new Map(data.map((r) => [r.incident_type, r])));
      });
  }, []);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("incidents")
      .select("*")
      .order("incident_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (tab === "pending") {
      query = query.is("approved_at", null).is("dismissed_at", null);
    } else if (tab === "approved") {
      query = query.not("approved_at", "is", null);
    } else if (tab === "dismissed") {
      query = query.not("dismissed_at", "is", null);
    }
    if (filterType) query = query.eq("incident_type", filterType);
    if (filterState) query = query.eq("state_abbr", filterState.toUpperCase());

    const { data } = await query;
    setIncidents(data ?? []);
    setLoading(false);
  }, [tab, filterType, filterState]);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  async function approve(incident: Incident) {
    setSaving(incident.id);
    await supabase
      .from("incidents")
      .update({
        approved_at: new Date().toISOString(),
        dismissed_at: null,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes[incident.id] ?? incident.reviewer_notes,
      })
      .eq("id", incident.id);
    setSaving(null);
    fetchIncidents();
  }

  async function dismiss(incident: Incident) {
    setSaving(incident.id);
    await supabase
      .from("incidents")
      .update({
        dismissed_at: new Date().toISOString(),
        approved_at: null,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes[incident.id] ?? incident.reviewer_notes,
      })
      .eq("id", incident.id);
    setSaving(null);
    fetchIncidents();
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "dismissed", label: "Dismissed" },
    { key: "all", label: "All" },
  ];

  const typeOptions = Array.from(typeConfigs.values()).sort(
    (a, b) => b.severity_weight - a.severity_weight
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-800">Incidents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review incidents extracted by the news digest. Approve to include in the heat map and severity scoring.
        </p>
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
          {typeOptions.map((t) => (
            <option key={t.incident_type} value={t.incident_type}>
              {t.label} (×{t.severity_weight})
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="State (e.g. TX)"
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
          maxLength={2}
          className="text-sm border border-gray-300 rounded px-3 py-1.5 w-28 text-gray-700"
        />
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : incidents.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">No incidents found.</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Title</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Location</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Source</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Conf.</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {incidents.map((inc) => {
                const config = typeConfigs.get(inc.incident_type ?? "");
                const isExpanded = expanded === inc.id;
                return (
                  <>
                    <tr
                      key={inc.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : inc.id)}
                    >
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {inc.incident_date
                          ? new Date(inc.incident_date + "T00:00:00").toLocaleDateString(undefined, {
                              month: "short", day: "numeric", year: "numeric",
                            })
                          : <span className="text-gray-300">unknown</span>}
                      </td>
                      <td className="px-4 py-3">
                        {config ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${severityColor(config.severity_weight)}`}>
                            {config.label}
                            <span className="opacity-60">×{config.severity_weight}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">{inc.incident_type ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">
                        {inc.title}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {[inc.city, inc.state_abbr].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {inc.source_url ? (
                          <a
                            href={inc.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:underline truncate max-w-[160px] block"
                          >
                            {inc.source_name ?? "Article →"}
                          </a>
                        ) : (
                          <span>{inc.source_name ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inc.confidence != null ? (
                          <span className={`font-medium ${confidenceColor(inc.confidence)}`}>
                            {Math.round(inc.confidence * 100)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-gray-300 text-xs">{isExpanded ? "▲" : "▼"}</span>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${inc.id}-detail`} className="bg-blue-50">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-3 max-w-3xl">
                            {inc.description && (
                              <p className="text-sm text-gray-700">{inc.description}</p>
                            )}
                            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                              {inc.jurisdiction_type && (
                                <span>Jurisdiction: <strong>{inc.jurisdiction_type}</strong></span>
                              )}
                              {inc.county_name && (
                                <span>County: <strong>{inc.county_name}</strong></span>
                              )}
                              {inc.digest_finding_id && (
                                <a
                                  href={`/admin/digest`}
                                  className="text-blue-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View digest finding #{inc.digest_finding_id} →
                                </a>
                              )}
                            </div>

                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Reviewer notes</label>
                              <textarea
                                rows={2}
                                value={notes[inc.id] ?? inc.reviewer_notes ?? ""}
                                onChange={(e) => setNotes((n) => ({ ...n, [inc.id]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full text-sm border border-gray-300 rounded px-3 py-2 resize-none"
                                placeholder="Optional notes…"
                              />
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); approve(inc); }}
                                disabled={saving === inc.id || !!inc.approved_at}
                                className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                {inc.approved_at ? "Approved ✓" : saving === inc.id ? "Saving…" : "Approve"}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); dismiss(inc); }}
                                disabled={saving === inc.id || !!inc.dismissed_at}
                                className="px-4 py-1.5 text-sm font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                              >
                                {inc.dismissed_at ? "Dismissed" : saving === inc.id ? "Saving…" : "Dismiss"}
                              </button>
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
