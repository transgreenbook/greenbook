"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import POIMiniForm, { type NewPOIResult } from "./POIMiniForm";

type LinkedPOI = {
  id: number;
  title: string;
  severity: number;
};

type Props = {
  // Finding data
  findingId: number;
  stateAbbr: string | null;
  billNumber: string;         // used to pre-fill new POI
  issues: string[];           // normalized issue tags
  jurisdictionType: string | null;
  billStatus: string | null;  // 'signed' | 'passed' | 'advancing' | etc.
  // Pre-linked POI from Claude (may be null for legislation findings)
  linkedPoi: LinkedPOI | null;
  // Callbacks
  onApproved: (findingId: number) => void;
  onCancel: () => void;
};

type Mode = 'select' | 'create' | 'confirm';

type POISearchResult = { id: number; title: string; severity: number | null };

export default function ApprovePanel({
  findingId,
  stateAbbr,
  billNumber,
  issues,
  jurisdictionType,
  billStatus,
  linkedPoi,
  onApproved,
  onCancel,
}: Props) {
  const isPassed = billStatus === 'signed' || billStatus === 'passed';

  // Non-passed bills skip POI selection entirely — just confirm a watch item
  // Pre-linked POI (Claude finding) skips to confirm
  const initialMode: Mode = (linkedPoi || !isPassed) ? 'confirm' : 'select';
  const [mode,   setMode]   = useState<Mode>(initialMode);
  const [poi,    setPoi]    = useState<LinkedPOI | null>(linkedPoi);
  const [delta,  setDelta]  = useState(0);
  const [watchItem, setWatchItem] = useState(true);

  // POI search state
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<POISearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Search POIs as user types
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('points_of_interest')
        .select('id, title, severity')
        .ilike('title', `%${query.trim()}%`)
        .order('title')
        .limit(8);
      setResults(data ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function selectPoi(p: POISearchResult) {
    setPoi({ id: p.id, title: p.title, severity: p.severity ?? 0 });
    setDelta(0);
    setMode('confirm');
  }

  function handleNewPoi(result: NewPOIResult) {
    setPoi({ id: result.id, title: result.title, severity: result.severity });
    setDelta(0);
    setMode('confirm');
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);

    try {
      // Apply severity delta to POI if selected and delta != 0
      if (poi && delta !== 0) {
        const newSeverity = Math.max(-10, Math.min(10, poi.severity + delta));
        const { error: poiErr } = await supabase
          .from('points_of_interest')
          .update({ severity: newSeverity })
          .eq('id', poi.id);
        if (poiErr) { setError('Failed to update POI severity: ' + poiErr.message); return; }
      }

      // Create watch item if requested
      let watchItemId: number | null = null;
      if (watchItem) {
        const { data: wi, error: wiErr } = await supabase
          .from('watch_items')
          .insert({
            item_type:         'bill',
            title:             billNumber
              ? `${stateAbbr ?? 'US'} ${billNumber}`
              : `${stateAbbr ?? 'US'} legislation`,
            jurisdiction_type: jurisdictionType ?? 'state',
            status:            'monitoring',
            linked_poi_id:     poi?.id ?? null,
            attributes:        { auto_created: true, source: 'digest_review' },
          })
          .select('id')
          .single();
        if (wiErr) console.warn('Could not create watch item:', wiErr.message);
        else watchItemId = wi.id;
      }

      // Mark finding as applied
      const { error: findingErr } = await supabase
        .from('digest_findings')
        .update({
          applied_at:   new Date().toISOString(),
          linked_poi_id: poi?.id ?? null,
          watch_item_id: watchItemId,
          severity_delta: delta !== 0 ? delta : null,
        })
        .eq('id', findingId);
      if (findingErr) { setError('Failed to mark finding as applied: ' + findingErr.message); return; }

      onApproved(findingId);
    } finally {
      setSaving(false);
    }
  }

  const newSeverity = poi ? Math.max(-10, Math.min(10, poi.severity + delta)) : null;

  // ── Select existing POI ──────────────────────────────────────────────────
  if (mode === 'select') {
    return (
      <div className="mt-3 border border-gray-200 rounded-lg bg-gray-50 p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Link to a POI
        </div>

        <div className="relative mb-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by POI title…"
            autoFocus
            className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              Searching…
            </span>
          )}
        </div>

        {results.length > 0 && (
          <div className="border border-gray-200 rounded bg-white mb-3 divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => selectPoi(r)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
              >
                <span className="text-gray-800">{r.title}</span>
                {r.severity !== null && (
                  <span className={`text-xs font-semibold ml-2 ${
                    r.severity < 0 ? 'text-red-500' : r.severity > 0 ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {r.severity > 0 ? `+${r.severity}` : r.severity}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('create')}
            className="text-xs text-blue-600 hover:underline"
          >
            + Create new POI
          </button>
          <button
            type="button"
            onClick={() => handleConfirmWithoutPoi()}
            className="text-xs text-gray-400 hover:underline"
          >
            Approve without linking POI
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto text-xs text-gray-400 hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Create new POI ───────────────────────────────────────────────────────
  if (mode === 'create') {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setMode('select')}
          className="text-xs text-gray-400 hover:underline mb-1 block"
        >
          ← Back to search
        </button>
        <POIMiniForm
          stateAbbr={stateAbbr}
          billNumber={billNumber}
          issues={issues}
          onSaved={handleNewPoi}
          onCancel={() => setMode('select')}
        />
      </div>
    );
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  return (
    <div className="mt-3 border border-green-100 rounded-lg bg-green-50 p-4 space-y-3">
      <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">
        {isPassed ? 'Confirm approval' : 'Add to watch list'}
      </div>

      {/* POI section — only for passed/signed bills */}
      {isPassed && (
        poi ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm">
              <span className="text-gray-700 font-medium">{poi.title}</span>
              <span className="text-gray-400 text-xs ml-2">current severity {poi.severity}</span>
            </div>
            {/* Severity delta adjuster */}
            <div className="flex items-center gap-1 border border-gray-200 rounded bg-white shrink-0">
              <button
                type="button"
                onClick={() => setDelta((d) => Math.max(-10, d - 1))}
                className="px-2 py-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded-l text-sm font-mono"
              >−</button>
              <span className={`px-2 text-sm font-semibold tabular-nums min-w-[2.5rem] text-center ${
                delta < 0 ? 'text-red-600' : delta > 0 ? 'text-green-600' : 'text-gray-400'
              }`}>
                {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta}
              </span>
              <button
                type="button"
                onClick={() => setDelta((d) => Math.min(10, d + 1))}
                className="px-2 py-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded-r text-sm font-mono"
              >+</button>
            </div>
            {delta !== 0 && newSeverity !== null && (
              <span className="text-xs text-gray-500 shrink-0">
                → <span className={newSeverity < 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                  {newSeverity > 0 ? `+${newSeverity}` : newSeverity}
                </span>
              </span>
            )}
            {!linkedPoi && (
              <button
                type="button"
                onClick={() => { setMode('select'); setPoi(null); setDelta(0); }}
                className="text-xs text-gray-400 hover:underline shrink-0"
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMode('select')}
            className="text-xs text-blue-600 hover:underline"
          >
            + Link to a POI
          </button>
        )
      )}

      {!isPassed && (
        <p className="text-xs text-gray-500">
          Bill is still advancing — no POI will be created until it passes.
        </p>
      )}

      {/* Watch item checkbox */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={watchItem}
          onChange={(e) => setWatchItem(e.target.checked)}
          className="rounded border-gray-300"
        />
        <span className="text-xs text-gray-600">Create watch item for ongoing monitoring</span>
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : poi && delta !== 0 ? 'Apply & Approve' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // Approve without linking a POI
  async function handleConfirmWithoutPoi() {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('digest_findings')
      .update({ applied_at: new Date().toISOString() })
      .eq('id', findingId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onApproved(findingId);
  }
}
