"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ApprovePanel from "@/components/admin/digest/ApprovePanel";

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
  // parsed from article_url for legislation findings
  _state_abbr: string | null;
  _bill_number: string;
  _issues: string[];
  _bill_status: string | null;
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
  if (f.applied_at)   return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Applied</span>;
  if (f.dismissed_at) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">Dismissed</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Pending</span>;
}

/** Parse "aclu:TX:SB 1264" into state abbr + bill number. */
function parseLegislationUrl(url: string): { stateAbbr: string | null; billNumber: string } {
  if (!url.startsWith('aclu:')) return { stateAbbr: null, billNumber: '' };
  const parts = url.split(':');
  // parts: ["aclu", "TX", "SB 1264"] or ["aclu", "TX", "SB 1264", "signed"]
  return { stateAbbr: parts[1] ?? null, billNumber: parts[2] ?? '' };
}

export default function DigestRunPage() {
  const params = useParams();
  const runId  = Number(params.runId);

  const [run,      setRun]      = useState<DigestRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [approvingId, setApprovingId] = useState<number | null>(null); // which finding has panel open
  const [busy,        setBusy]     = useState<number | null>(null);       // dismiss spinner
  const [bulkApproving,  setBulkApproving]  = useState(false);
  const [bulkDismissing, setBulkDismissing] = useState(false);

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

    // Parse ACLU findings to extract state/bill keys for batch status lookup
    const rawFindings = findingsData ?? [];
    const parsed = rawFindings.map((f: Record<string, unknown>) => {
      const url = (f.article_url as string) ?? '';
      const { stateAbbr, billNumber } = parseLegislationUrl(url);
      return { f, stateAbbr, billNumber, isLegislation: url.startsWith('aclu:') };
    });

    // Batch-fetch bill statuses from legislation_bills for ACLU findings
    const acluKeys = parsed
      .filter((p) => p.isLegislation && p.stateAbbr && p.billNumber)
      .map((p) => `${p.stateAbbr}:${p.billNumber}`);

    let billStatusMap: Record<string, string> = {};
    if (acluKeys.length > 0) {
      const uniqueStates = [...new Set(parsed.filter((p) => p.isLegislation).map((p) => p.stateAbbr).filter(Boolean))];
      const { data: billRows } = await supabase
        .from('legislation_bills')
        .select('state_abbr, bill_number, status')
        .in('state_abbr', uniqueStates as string[]);
      billStatusMap = Object.fromEntries(
        (billRows ?? []).map((b: { state_abbr: string; bill_number: string; status: string }) =>
          [`${b.state_abbr}:${b.bill_number}`, b.status]
        )
      );
    }

    setFindings(
      parsed.map(({ f, stateAbbr, billNumber }): Finding => {
        const billStatus = (stateAbbr && billNumber)
          ? (billStatusMap[`${stateAbbr}:${billNumber}`] ?? null)
          : null;
        return {
          id:               f.id as number,
          article_title:    f.article_title as string | null,
          article_url:      f.article_url as string,
          article_date:     f.article_date as string | null,
          summary:          f.summary as string | null,
          suggested_action: f.suggested_action as string | null,
          confidence:       f.confidence as number | null,
          relevance:        f.relevance as string | null,
          jurisdiction_type: f.jurisdiction_type as string | null,
          severity_delta:   f.severity_delta as number | null,
          linked_poi_id:    f.linked_poi_id as number | null,
          legislation_url:  f.legislation_url as string | null,
          watch_item_id:    f.watch_item_id as number | null,
          applied_at:       f.applied_at as string | null,
          dismissed_at:     f.dismissed_at as string | null,
          reviewer_notes:   f.reviewer_notes as string | null,
          source_name:      (f.news_sources as { name: string } | null)?.name ?? null,
          poi_title:        (f.points_of_interest as { title: string; severity: number } | null)?.title ?? null,
          poi_severity:     (f.points_of_interest as { title: string; severity: number } | null)?.severity ?? null,
          watch_item_title: (f.watch_items as { title: string } | null)?.title ?? null,
          _state_abbr:      stateAbbr,
          _bill_number:     billNumber,
          _issues:          [],
          _bill_status:     billStatus,
        };
      })
    );
    setLoading(false);
  }, [runId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDismiss(finding: Finding) {
    if (!confirm("Dismiss this finding? It will be deleted.")) return;
    setBusy(finding.id);
    const { error } = await supabase
      .from("digest_findings")
      .delete()
      .eq("id", finding.id);
    setBusy(null);
    if (error) { alert("Failed to dismiss: " + error.message); return; }
    setFindings((prev) => prev.filter((f) => f.id !== finding.id));
  }

  function handleApproved(findingId: number) {
    setApprovingId(null);
    setFindings((prev) =>
      prev.map((f) => f.id === findingId ? { ...f, applied_at: new Date().toISOString() } : f)
    );
  }

  async function handleBulkApprove(items: Finding[]) {
    if (!confirm(`Bulk approve ${items.length} findings as watch items?`)) return;
    setBulkApproving(true);
    const now = new Date().toISOString();
    const results = await Promise.allSettled(
      items.map(async (f) => {
        let watchItemId: number | null = null;
        if (f._bill_number) {
          const { data: wi } = await supabase
            .from('watch_items')
            .insert({
              item_type:         'bill',
              title:             `${f._state_abbr ?? 'US'} ${f._bill_number}`,
              jurisdiction_type: f.jurisdiction_type ?? 'state',
              status:            'monitoring',
              linked_poi_id:     null,
              attributes:        { auto_created: true, source: 'digest_bulk_approve' },
            })
            .select('id')
            .single();
          watchItemId = wi?.id ?? null;
        }
        await supabase
          .from('digest_findings')
          .update({ applied_at: now, watch_item_id: watchItemId })
          .eq('id', f.id);
      })
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) alert(`${failed} findings failed to approve. Refresh to check.`);
    setBulkApproving(false);
    fetchData();
  }

  async function handleBulkDismiss(items: Finding[]) {
    if (!confirm(`Dismiss ${items.length} findings? This cannot be undone.`)) return;
    setBulkDismissing(true);
    const results = await Promise.allSettled(
      items.map((f) =>
        supabase.from('digest_findings').delete().eq('id', f.id)
      )
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) alert(`${failed} findings failed to dismiss. Refresh to check.`);
    setBulkDismissing(false);
    fetchData();
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading...</div>;
  if (!run)    return <div className="p-6 text-sm text-gray-500">Digest run not found.</div>;

  const runDate = new Date(run.run_at).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });

  const pending  = findings.filter((f) => !f.applied_at && !f.dismissed_at);
  const reviewed = findings.filter((f) =>  f.applied_at || f.dismissed_at);

  const grouped = RELEVANCE_ORDER.map((rel) => ({
    label: rel,
    items: pending.filter((f) => relevanceLabel(f) === rel),
  })).filter((g) => g.items.length > 0);

  function renderFinding(f: Finding) {
    const isPending      = !f.applied_at && !f.dismissed_at;
    const isApproving    = approvingId === f.id;
    const isDismissing   = busy === f.id;
    const isLegislation  = f.article_url?.startsWith('aclu:');

    const linkedPoi = f.linked_poi_id && f.poi_title !== null && f.poi_severity !== null
      ? { id: f.linked_poi_id, title: f.poi_title, severity: f.poi_severity }
      : null;

    return (
      <div key={f.id} className="border border-gray-200 rounded-lg p-4 mb-3 bg-white">
        {/* Header */}
        <div className="flex items-start gap-3 mb-2">
          <span className={`shrink-0 mt-0.5 text-xs font-semibold uppercase px-2 py-0.5 rounded-full ${relevanceColor(relevanceLabel(f))}`}>
            {relevanceLabel(f)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm leading-snug">
              {f.article_title ?? "(no title)"}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {f.source_name ?? (isLegislation ? "ACLU tracker" : "unknown source")}
              {f.article_date && <> · {new Date(f.article_date).toLocaleDateString()}</>}
              {f.jurisdiction_type && <> · <span className="capitalize">{f.jurisdiction_type}</span></>}
              {f.confidence !== null && <> · {Math.round(f.confidence * 100)}% confidence</>}
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
              className="text-purple-600 hover:underline font-medium"
              title="May not exist if Trans Legislation Tracker doesn't cover this bill">
              Trans Legislation Tracker →
            </a>
          )}
          {f.article_url && !isLegislation && (
            <a href={f.article_url} target="_blank" rel="noopener noreferrer"
              className="text-gray-400 hover:underline">
              Article →
            </a>
          )}
          {f.watch_item_title && (
            <span className="text-blue-600">Updates watch: {f.watch_item_title}</span>
          )}
        </div>

        {/* Actions */}
        {isPending && !isApproving && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setApprovingId(f.id)}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Approve…
            </button>
            <button
              onClick={() => handleDismiss(f)}
              disabled={isDismissing}
              className="px-3 py-1.5 text-xs font-medium rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              {isDismissing ? "Dismissing…" : "Dismiss"}
            </button>
          </div>
        )}

        {/* Approve panel */}
        {isPending && isApproving && (
          <ApprovePanel
            findingId={f.id}
            stateAbbr={f._state_abbr}
            billNumber={f._bill_number}
            issues={f._issues}
            jurisdictionType={f.jurisdiction_type}
            billStatus={f._bill_status}
            linkedPoi={linkedPoi}
            onApproved={handleApproved}
            onCancel={() => setApprovingId(null)}
          />
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

      {grouped.map(({ label, items }) => {
        const passedItems    = items.filter((f) => f._bill_status === 'signed' || f._bill_status === 'passed');
        const nonPassedItems = items.filter((f) => f._bill_status !== 'signed' && f._bill_status !== 'passed');
        const hasBoth = passedItems.length > 0 && nonPassedItems.length > 0;

        return (
          <div key={label} className="mb-6">
            {/* Priority group header */}
            <h2 className={`text-xs font-bold uppercase tracking-wide mb-3 ${
              label === "high" ? "text-red-600" : label === "medium" ? "text-amber-600" : "text-gray-400"
            }`}>
              {label === "high" ? "High Priority" : label === "medium" ? "Medium Priority" : "Low Priority / FYI"}
              <span className="ml-2 font-normal normal-case text-gray-400">({items.length})</span>
            </h2>

            {/* Passed/signed bills — individual review only, no bulk actions */}
            {passedItems.length > 0 && (
              <div className="mb-4">
                {hasBoth && (
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 pl-1">
                    Passed / Signed
                  </div>
                )}
                {passedItems.map(renderFinding)}
              </div>
            )}

            {/* Non-passed bills + news articles — bulk actions available */}
            {nonPassedItems.length > 0 && (
              <div>
                {hasBoth && (
                  <div className="flex items-center gap-2 mb-2 pl-1">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Advancing ({nonPassedItems.length})
                    </span>
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={() => handleBulkApprove(nonPassedItems)}
                        disabled={bulkApproving || bulkDismissing}
                        className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {bulkApproving ? "Approving…" : `Approve ${nonPassedItems.length} as watch items`}
                      </button>
                      <button
                        onClick={() => handleBulkDismiss(nonPassedItems)}
                        disabled={bulkApproving || bulkDismissing}
                        className="text-xs px-3 py-1 rounded border border-red-100 text-red-400 hover:bg-red-50 disabled:opacity-50"
                      >
                        {bulkDismissing ? "Dismissing…" : `Dismiss ${nonPassedItems.length}`}
                      </button>
                    </div>
                  </div>
                )}
                {!hasBoth && nonPassedItems.length > 1 && (
                  <div className="flex justify-end gap-2 mb-3">
                    <button
                      onClick={() => handleBulkApprove(nonPassedItems)}
                      disabled={bulkApproving || bulkDismissing}
                      className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {bulkApproving ? "Approving…" : `Approve ${nonPassedItems.length} as watch items`}
                    </button>
                    <button
                      onClick={() => handleBulkDismiss(nonPassedItems)}
                      disabled={bulkApproving || bulkDismissing}
                      className="text-xs px-3 py-1 rounded border border-red-100 text-red-400 hover:bg-red-50 disabled:opacity-50"
                    >
                      {bulkDismissing ? "Dismissing…" : `Dismiss ${nonPassedItems.length}`}
                    </button>
                  </div>
                )}
                {nonPassedItems.map(renderFinding)}
              </div>
            )}
          </div>
        );
      })}

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
