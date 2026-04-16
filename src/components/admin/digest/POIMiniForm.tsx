"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Category = { id: number; name: string };
type StateCentroid = { name: string; abbr: string; lat: number; lng: number };

export type NewPOIResult = {
  id: number;
  title: string;
  severity: number;
};

type Props = {
  // Pre-fill values from the bill
  stateAbbr: string | null;
  billNumber: string;
  issues: string[];           // normalized issue tags
  defaultSeverity?: number;   // defaults to -3
  onSaved: (poi: NewPOIResult) => void;
  onCancel: () => void;
};

const DEFAULT_SEVERITY = -3;

function issueLabel(tag: string) {
  return tag.replace(/_/g, ' ');
}

/** Format a bill number in LegiScan style: letters uppercased, digits zero-padded to 4.
 *  e.g. "SB 174" → "SB0174", "H928" → "H0928" */
function formatBillNumber(raw: string): string {
  const clean = raw.replace(/[\s.]/g, '');
  const match = clean.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return clean;
  return `${match[1].toUpperCase()}${match[2].padStart(4, '0')}`;
}

export default function POIMiniForm({
  stateAbbr,
  billNumber,
  issues,
  defaultSeverity = DEFAULT_SEVERITY,
  onSaved,
  onCancel,
}: Props) {
  const [categories, setCategories]     = useState<Category[]>([]);
  const [centroids,  setCentroids]      = useState<StateCentroid[]>([]);
  const [title,       setTitle]         = useState('');
  const [description, setDescription]  = useState('');
  const [categoryId,  setCategoryId]   = useState('');
  const [severity,    setSeverity]     = useState(defaultSeverity);
  const [saving,      setSaving]       = useState(false);
  const [error,       setError]        = useState<string | null>(null);

  // Derive a human-readable state name for display
  const stateName = centroids.find((c) => c.abbr === stateAbbr)?.name ?? stateAbbr ?? 'Unknown';

  useEffect(() => {
    // Load categories
    supabase
      .from('categories')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCategories(data ?? []));

    // Load state centroids for coordinate lookup
    fetch('/state-centroids.geojson')
      .then((r) => r.json())
      .then((geojson) => {
        const cs: StateCentroid[] = (geojson.features ?? []).map(
          (f: { properties: { NAME: string; STUSPS: string }; geometry: { coordinates: [number, number] } }) => ({
            name: f.properties.NAME,
            abbr: f.properties.STUSPS,
            lng:  f.geometry.coordinates[0],
            lat:  f.geometry.coordinates[1],
          })
        );
        setCentroids(cs);
      });
  }, []);

  // Set pre-filled title + description once state name resolves
  useEffect(() => {
    if (!stateName) return;
    const prefix = stateAbbr && billNumber
      ? `${stateAbbr} ${formatBillNumber(billNumber)}`
      : stateName;
    setTitle(`${prefix} — Anti-Trans Legislation`);
    if (issues.length > 0) {
      setDescription(`Covers: ${issues.map(issueLabel).join(', ')}.`);
    }
  }, [stateName, stateAbbr, billNumber, issues]);

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return; }

    const centroid = centroids.find((c) => c.abbr === stateAbbr);
    if (!centroid) { setError('Could not find coordinates for this state.'); return; }

    setSaving(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('points_of_interest')
      .insert({
        title:       title.trim(),
        description: description.trim() || null,
        geom:        `POINT(${centroid.lng} ${centroid.lat})`,
        effect_scope: 'state',
        prominence:  'regional',
        severity,
        category_id: categoryId ? parseInt(categoryId) : null,
        is_verified: false,
        attributes:  { auto_created: true, source: 'digest_review', bill: billNumber },
      })
      .select('id, title, severity')
      .single();

    setSaving(false);

    if (err) { setError(err.message); return; }
    onSaved({ id: data.id, title: data.title, severity: data.severity });
  }

  const inputCls = "w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="mt-3 border border-blue-100 rounded-lg bg-blue-50 p-4 space-y-3">
      <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
        New POI
      </div>

      {/* State — locked */}
      <div>
        <label className={labelCls}>State</label>
        <div className="px-3 py-1.5 text-sm bg-gray-100 border border-gray-200 rounded text-gray-600">
          {stateName} ({stateAbbr})
        </div>
      </div>

      {/* Title */}
      <div>
        <label className={labelCls}>Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="e.g. Texas — Anti-Trans Legislation"
        />
      </div>

      {/* Category + Severity */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputCls}
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Initial severity</label>
          <div className="flex items-center gap-1 border border-gray-200 rounded bg-white">
            <button
              type="button"
              onClick={() => setSeverity((s) => Math.max(-10, s - 1))}
              disabled={severity <= -10}
              className="px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded-l text-sm font-mono"
            >−</button>
            <span className={`flex-1 text-center text-sm font-semibold tabular-nums ${
              severity < 0 ? 'text-red-600' : severity > 0 ? 'text-green-600' : 'text-gray-400'
            }`}>
              {severity > 0 ? `+${severity}` : severity}
            </span>
            <button
              type="button"
              onClick={() => setSeverity((s) => Math.min(10, s + 1))}
              disabled={severity >= 10}
              className="px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded-r text-sm font-mono"
            >+</button>
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={inputCls}
          placeholder="Brief description of what this POI tracks"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create POI'}
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
}
