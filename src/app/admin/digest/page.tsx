"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type DigestRun = {
  id: number;
  run_at: string;
  articles_fetched: number;
  findings_count: number;
  email_sent_at: string | null;
  attributes: { digest_summary?: string } | null;
  pending_count: number;
};

export default function DigestRunsPage() {
  const [runs, setRuns] = useState<DigestRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRuns() {
      const { data: runData } = await supabase
        .from("digest_runs")
        .select("id, run_at, articles_fetched, findings_count, email_sent_at, attributes")
        .order("run_at", { ascending: false })
        .limit(30);

      if (!runData) { setLoading(false); return; }

      // For each run, count pending findings (not yet applied or dismissed)
      const withCounts = await Promise.all(
        runData.map(async (run) => {
          const { count } = await supabase
            .from("digest_findings")
            .select("id", { count: "exact", head: true })
            .eq("digest_run_id", run.id)
            .is("applied_at", null)
            .is("dismissed_at", null);
          return { ...run, pending_count: count ?? 0 };
        })
      );

      setRuns(withCounts);
      setLoading(false);
    }
    fetchRuns();
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-800">News Digest Runs</h1>
        <p className="text-sm text-gray-500 mt-1">Review and approve findings from each digest run.</p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Articles</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Findings</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Pending</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {runs.map((run) => (
              <tr key={run.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {new Date(run.run_at).toLocaleDateString(undefined, {
                    year: "numeric", month: "short", day: "numeric",
                  })}
                  <span className="ml-2 text-xs text-gray-400">
                    {new Date(run.run_at).toLocaleTimeString(undefined, {
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                  {run.articles_fetched}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                  {run.findings_count}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {run.pending_count > 0 ? (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold text-xs">
                      {run.pending_count}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {run.email_sent_at ? (
                    <span className="text-green-600 text-xs">
                      Sent {new Date(run.email_sent_at).toLocaleTimeString(undefined, {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">Not sent</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/digest/${run.id}`}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No digest runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
