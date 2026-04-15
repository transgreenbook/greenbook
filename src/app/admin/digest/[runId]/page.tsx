"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Finding = {
  id: number;
  article_title: string | null;
  article_url: string;
  article_date: string | null;
  summary: string | null;
  suggested_action: string | null;
  confidence: number | null;
  jurisdiction_type: string | null;
  severity_delta: number | null;
  linked_poi_id: number | null;
  legislation_url: string | null;
  watch_item_id: number | null;
  relevance: string | null;
  applied_at: string | null;
  dismissed_at: string | null;
  reviewer_notes: string | null;
  // joined
  source_name: string | null;
  poi_title: string | null;
  poi_severity: number | null;
  watch_item_title: string | null;
  // local UI state
  _delta: number;
};

type DigestRun = {
  id: number;
  run_at: string;
  articles_fetched: number;
  attributes: { digest_summary?: string } | null;
};

const RELEVANCE_ORDER = ["high", "medium", "low"] as const;

function relevanceLabel(f: Finding): "high" | "medium" | "low" {
  if (f.relevance === "high" || f.relevance === "medium" || f.relevance === "low") return f.relevance;
  // Fallback for older findings without stored relevance
  const c = f.confidence ?? 0;
  if (c >= 0.9) return "high";
  if (c >= 0.7) return "medium";
  return "low";
}

function relevanceColor(r: string) {
  if (r === "high") return "bg-red-100 text-red-700";
  if (r === "medium") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-500";
}

function statusBadge(f: Finding) {
  if (f.applied_at) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Applied</span>;
  if (f.dismissed_at) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">Dismissed</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Pending</span>;
}

export default function DigestRunPage() {
  const params = useParams();
  const router = useRouter();
  const runId = Number(params.runId);

  const [run, setRun] = useState<DigestRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null); // finding id being acted on

  const fetchData = useCallback(async () => {
    const [{ data: runData }, { data: findingsData }] = await Promise.all([
      supabase
        .from("digest_runs")
        .select("id, run_at, articles_fetched, attributes")
        .eq("id", runId)
        .single(),
      supabase
        .from("digest_findings")
        .select(`
          id, article_title, article_url, article_date,
          summary, suggested_action, confidence, relevance,
          jurisdiction_type, severity_delta, linked_poi_id,
          legislation_url, watch_item_id,
          applied_at, dismissed_at, reviewer_notes,
          news_sources ( name ),
          points_of_interest ( title, severity ),
          watch_items ( title )
        `)
        .eq("digest_run_id", runId)
        .order("confidence", { ascending: false }),
    ]);

    setRun(runData);
    setFindings(
      (findingsData ?? []).map((f: Record<string, unknown>) => ({
        ...f,
        source_name: (f.news_sources as { name: string } | null)?.name ?? null,
        poi_title: (f.points_of_interest as { title: string; severity: number } | null)?.title ?? null,
        poi_severity: (f.points_of_interest as { title: string; severity: number } | null)?.severity ?? null,
        watch_item_title: (f.watch_items as { title: string } | null)?.title ?? null,
        _delta: (f.severity_delta as number | null) ?? 0,
      }))
    );
    setLoading(false);
  }, [runId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function adjustDelta(id: number, dir: 1 | -1) {
    setFindings((prev) =>
      prev.map((f) => f.id === id ? { ...f, _delta: f._delta + dir } : f)
    );
  }

  async function handleApprove(finding: Finding) {
    setBusy(finding.id);
    try {
      // Apply severity delta to POI if present
      if (finding._delta !== 0 && finding.linked_poi_id && finding.poi_severity !== null) {
        const newSeverity = Math.max(-10, Math.min(10, finding.poi_severity + finding._delta));
        const { error } = await supabase
          .from("points_of_interest")
          .update({ severity: newSeverity })
          .eq("id", finding.linked_poi_id);
        if (error) { alert("Failed to update POI severity: " + error.message); return; }
      }

      // Mark finding as applied
      const { error } = await supabase
        .from("digest_findings")
        .update({ applied_at: new Date().toISOString(), severity_delta: finding._delta })
        .eq("id", finding.id);
      if (error) { alert("Failed to mark finding as applied: " + error.message); return; }

      setFindings((prev) =>
        prev.map((f) => f.id === finding.id ? { ...f, applied_at: new Date().toISOString() } : f)
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDismiss(finding: Finding) {
    if (!confirm("Dismiss this finding? It will be deleted.")) return;
    setBusy(finding.id);
    try {
      const { error } = await supabase
        .from("digest_findings")
        .delete()
        .eq("id", finding.id);
      if (error) { alert("Failed to dismiss finding: " + error.message); return; }
      setFindings((prev) => prev.filter((f) => f.id !== finding.id));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading...</div>;
  }
  if (!run) {
    return <div className="p-6 text-sm text-gray-500">Digest run not found.</div>;
  }

  const runDate = new Date(run.run_at).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });

  const pending   = findings.filter((f) => !f.applied_at && !f.dismissed_at);
  const reviewed  = findings.filter((f) =>  f.applied_at || f.dismissed_at);

  const grouped = RELEVANCE_ORDER.map((rel) => ({
    label: rel,
    items: pending.filter((f) => relevanceLabel(f) === rel),
  })).filter((g) => g.items.length > 0);

  function renderFinding(f: Finding) {
    const isBusy = busy === f.id;
    const isPending = !f.applied_at && !f.dismissed_at;

    return (
      <div key={f.id} className="border border-gray-200 rounded-lg p-4 mb-3 bg-white">
        <div className="flex items-start gap-3 mb-2">
          <span className={`shrink-0 mt-0.5 text-xs font-semibold uppercase px-2 py-0.5 rounded-full ${relevanceColor(relevanceLabel(f))}`}>
            {relevanceLabel(f)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm leading-snug">
              {f.article_title ?? "(no title)"}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {f.source_name ?? "unknown source"}
              {f.article_date && (
                <> · {new Date(f.article_date).toLocaleDateString()}</>
              )}
              {f.jurisdiction_type && (
                <> · <span className="capitalize">{f.jurisdiction_type}</span></>
              )}
              {f.confidence !== null && (
                <> · {Math.round(f.confidence * 100)}% confidence</>
              )}
            </div>
          </div>
          <div className="shrink-0">{statusBadge(f)}</div>
        </div>

        {f.summary && (
          <p className="text-sm text-gray-700 mb-2">{f.summary}</p>
        )}

        {f.suggested_action && (
          <p className="text-sm text-gray-500 mb-3">
            <span className="font-medium text-gray-600">Suggested action:</span> {f.suggested_action}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          {f.legislation_url && (
            <a href={f.legislation_url} target="_blank" rel="noopener noreferrer"
              className="text-purple-600 hover:underline font-medium">
              Primary source →
            </a>
          )}
          {f.article_url && (
            <a href={f.article_url} target="_blank" rel="noopener noreferrer"
              className="text-gray-400 hover:underline">
              Article →
            </a>
          )}
          {f.watch_item_title && (
            <span className="text-blue-600">Updates watch: {f.watch_item_title}</span>
          )}
        </div>

        {isPending && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
            {/* Severity delta adjuster */}
            {f.linked_poi_id !== null ? (
              <div className="flex items-center gap-2 mr-2">
                <span className="text-xs text-gray-500">
                  {f.poi_title ?? `POI #${f.linked_poi_id}`}
                  {f.poi_severity !== null && (
                    <span className="ml-1 text-gray-400">
                      (severity {f.poi_severity}
                      {f._delta !== 0 && (
                        <span className={f._delta < 0 ? "text-red-500" : "text-green-600"}>
                          {" → "}{Math.max(-10, Math.min(10, f.poi_severity + f._delta))}
                        </span>
                      )}
                      )
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1 border border-gray-200 rounded">
                  <button
                    onClick={() => adjustDelta(f.id, -1)}
                    disabled={f._delta <= -10}
                    className="px-2 py-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded-l text-sm font-mono"
                  >−</button>
                  <span className={`px-2 text-sm font-semibold tabular-nums min-w-[2.5rem] text-center ${
                    f._delta < 0 ? "text-red-600" : f._delta > 0 ? "text-green-600" : "text-gray-400"
                  }`}>
                    {f._delta > 0 ? `+${f._delta}` : f._delta === 0 ? "±0" : f._delta}
                  </span>
                  <button
                    onClick={() => adjustDelta(f.id, 1)}
                    disabled={f._delta >= 10}
                    className="px-2 py-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded-r text-sm font-mono"
                  >+</button>
                </div>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => handleDismiss(f)}
                disabled={isBusy}
                className="px-3 py-1.5 text-xs font-medium rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                Dismiss
              </button>
              <button
                onClick={() => handleApprove(f)}
                disabled={isBusy}
                className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isBusy ? "Saving…" : f.linked_poi_id && f._delta !== 0 ? "Apply & Approve" : "Approve"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin/digest" className="text-sm text-gray-400 hover:text-gray-600">
          ← Digest runs
        </Link>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">{runDate}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {run.articles_fetched} articles · {findings.length} findings
            {pending.length > 0 && (
              <span className="ml-2 text-amber-600 font-medium">{pending.length} pending</span>
            )}
          </p>
        </div>
      </div>

      {run.attributes?.digest_summary && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-sm text-gray-700 leading-relaxed">
          {run.attributes.digest_summary}
        </div>
      )}

      {pending.length === 0 && reviewed.length === 0 && (
        <div className="text-sm text-gray-400 py-10 text-center">No findings for this run.</div>
      )}

      {grouped.map(({ label, items }) => (
        <div key={label} className="mb-6">
          <h2 className={`text-xs font-bold uppercase tracking-wide mb-3 ${
            label === "high" ? "text-red-600" : label === "medium" ? "text-amber-600" : "text-gray-400"
          }`}>
            {label === "high" ? "High Priority" : label === "medium" ? "Medium Priority" : "Low Priority / FYI"}
            <span className="ml-2 font-normal normal-case text-gray-400">({items.length})</span>
          </h2>
          {items.map(renderFinding)}
        </div>
      ))}

      {reviewed.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-300 mb-3">
            Reviewed ({reviewed.length})
          </h2>
          {reviewed.map(renderFinding)}
        </div>
      )}
    </div>
  );
}
