"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  poisToCsv,
  downloadCsv,
  parseCsv,
  validateCsvRows,
  buildDiff,
  type DiffRow,
  type CsvRow,
  type ValidationError,
} from "@/lib/poi-csv";

// ── Types ─────────────────────────────────────────────────────────────────────

type POI = {
  id: number;
  title: string;
  is_verified: boolean;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  category_id: number | null;
  category_name: string | null;
  source: string | null;
  review_after: string | null;
  review_note: string | null;
  // Full fields for export (fetched lazily)
  description?: string | null;
  prominence?: string | null;
  street_address?: string | null;
  phone?: string | null;
  website_url?: string | null;
  tags?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  source_date?: string | null;
  review_note_full?: string | null;
};

type Category = {
  id: number;
  name: string;
  color: string | null;
  // null = never fetched, number = known count
  count: number | null;
  // whether this category's POIs have been loaded into `pois`
  loaded: boolean;
  // bulk sources (like refuge_restrooms) start hidden and unloaded
  bulk: boolean;
};

type ImportPhase = "idle" | "validating" | "preview" | "importing" | "done";

// Sources that are too large to load by default
const BULK_SOURCES = new Set(["refuge_restrooms", "lgbtq_venues"]);
// Row count above which we warn before loading
const LOAD_WARNING_THRESHOLD = 200;

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPOIsPage() {
  const [pois, setPois] = useState<POI[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [hiddenCatIds, setHiddenCatIds] = useState<Set<number>>(new Set());
  const [hideUnverified, setHideUnverified] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Import state
  const [importPhase, setImportPhase] = useState<ImportPhase>("idle");
  const [importDiff, setImportDiff] = useState<DiffRow[]>([]);
  const [importErrors, setImportErrors] = useState<ValidationError[]>([]);
  const [importSkipIds, setImportSkipIds] = useState<Set<number>>(new Set()); // row indices to skip
  const [importResult, setImportResult] = useState<{ updated: number; created: number; skipped: CsvRow[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  // ── Persist filters across navigation ───────────────────────────────────────

  const FILTER_KEY = "admin-poi-filters";

  // Save filters to sessionStorage whenever they change (but not during initial load)
  useEffect(() => {
    if (loading) return;
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
      hiddenCatIds: Array.from(hiddenCatIds),
      hideUnverified,
      reviewOnly,
    }));
  }, [hiddenCatIds, hideUnverified, reviewOnly, loading]);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => { initialLoad(); }, []);

  async function initialLoad() {
    setLoading(true);

    // 1. Fetch categories with counts
    const [{ data: catData }, { data: countData }] = await Promise.all([
      supabase.from("categories").select("id, name, color").order("name"),
      supabase.rpc("poi_counts_by_category"),
    ]);

    const countMap: Record<number, number> = {};
    for (const row of (countData ?? []) as { category_id: number; count: number }[]) {
      countMap[row.category_id] = row.count;
    }

    // Identify bulk categories by checking if any of their POIs come from bulk sources
    // We use a heuristic: categories with >500 POIs from bulk sources are flagged bulk
    const { data: bulkCats } = await supabase
      .from("points_of_interest")
      .select("category_id")
      .in("source", Array.from(BULK_SOURCES))
      .limit(1000);
    const bulkCatIds = new Set((bulkCats ?? []).map((r) => r.category_id));

    const cats: Category[] = (catData ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      count: countMap[c.id] ?? 0,
      loaded: false,
      bulk: bulkCatIds.has(c.id),
    }));
    setCategories(cats);

    // 2. Load unverified POIs (across all non-bulk categories)
    const nonBulkCatIds = cats.filter((c) => !c.bulk).map((c) => c.id);
    const { data: poiData } = await supabase
      .from("points_of_interest")
      .select("id, title, is_verified, is_visible, created_at, updated_at, category_id, categories(name), source, review_after, review_note")
      .eq("is_verified", false)
      .in("category_id", nonBulkCatIds)
      .order("created_at", { ascending: false });

    setPois(mapPOIs(poiData ?? []));
    // Categories are NOT marked loaded here — the initial fetch only loads
    // unverified POIs. Clicking a category button loads all its POIs.

    // Restore saved filters, or default to hiding bulk categories
    const saved = sessionStorage.getItem(FILTER_KEY);
    if (saved) {
      const { hiddenCatIds: savedHidden, hideUnverified: savedHide, reviewOnly: savedReview } = JSON.parse(saved);
      setHiddenCatIds(new Set(savedHidden as number[]));
      setHideUnverified(savedHide);
      setReviewOnly(savedReview);
    } else {
      setHiddenCatIds(new Set(cats.filter((c) => c.bulk).map((c) => c.id)));
    }
    setLoading(false);
  }

  function mapPOIs(raw: Record<string, unknown>[]): POI[] {
    return raw.map((p) => ({
      id:            p.id as number,
      title:         p.title as string,
      is_verified:   p.is_verified as boolean,
      is_visible:    (p.is_visible ?? true) as boolean,
      created_at:    p.created_at as string,
      updated_at:    p.updated_at as string,
      category_id:   p.category_id as number | null,
      category_name: (p.categories as { name: string } | null)?.name ?? null,
      source:        p.source as string | null,
      review_after:  p.review_after as string | null,
      review_note:   p.review_note as string | null,
    }));
  }

  // ── Load a category on demand ────────────────────────────────────────────────

  async function loadCategory(cat: Category) {
    const count = cat.count ?? 0;
    if (
      count > LOAD_WARNING_THRESHOLD &&
      !confirm(
        `Loading "${cat.name}" will add ${count.toLocaleString()} records. Continue?`
      )
    ) {
      return;
    }

    const { data } = await supabase
      .from("points_of_interest")
      .select("id, title, is_verified, is_visible, created_at, updated_at, category_id, categories(name), source, review_after, review_note")
      .eq("category_id", cat.id)
      .order("created_at", { ascending: false });

    setPois((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newPois = mapPOIs((data ?? []).filter((p) => !existingIds.has(p.id as number)));
      return [...prev, ...newPois];
    });
    setCategories((prev) =>
      prev.map((c) => (c.id === cat.id ? { ...c, loaded: true } : c))
    );
    // Make the category visible
    setHiddenCatIds((prev) => {
      const next = new Set(prev);
      next.delete(cat.id);
      return next;
    });
  }

  // ── Filtered list ────────────────────────────────────────────────────────────

  const visiblePois = pois
    .filter((p) => !hiddenCatIds.has(p.category_id ?? -1))
    .filter((p) => !hideUnverified || p.is_verified)
    .filter((p) => !reviewOnly || (p.review_after && p.review_after <= today));

  const reviewDueCount = pois.filter(
    (p) => p.review_after && p.review_after <= today
  ).length;

  // ── Per-row actions ──────────────────────────────────────────────────────────

  async function toggleVerified(id: number, current: boolean) {
    await supabase.from("points_of_interest").update({ is_verified: !current }).eq("id", id);
    setPois((prev) => prev.map((p) => p.id === id ? { ...p, is_verified: !current } : p));
  }

  async function toggleVisible(id: number, current: boolean) {
    await supabase.from("points_of_interest").update({ is_visible: !current }).eq("id", id);
    setPois((prev) => prev.map((p) => p.id === id ? { ...p, is_visible: !current } : p));
  }

  async function deletePOI(id: number) {
    if (!confirm("Delete this POI? This cannot be undone.")) return;
    await supabase.from("points_of_interest").delete().eq("id", id);
    setPois((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  // ── Batch actions ────────────────────────────────────────────────────────────

  function toggleSelectAll() {
    if (selectedIds.size === visiblePois.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visiblePois.map((p) => p.id)));
    }
  }

  async function batchSetVerified(value: boolean) {
    const ids = Array.from(selectedIds);
    await supabase.from("points_of_interest").update({ is_verified: value }).in("id", ids);
    setPois((prev) => prev.map((p) => selectedIds.has(p.id) ? { ...p, is_verified: value } : p));
    setSelectedIds(new Set());
  }

  async function batchSetVisible(value: boolean) {
    const ids = Array.from(selectedIds);
    await supabase.from("points_of_interest").update({ is_visible: value }).in("id", ids);
    setPois((prev) => prev.map((p) => selectedIds.has(p.id) ? { ...p, is_visible: value } : p));
    setSelectedIds(new Set());
  }

  async function batchDelete() {
    if (!confirm(`Delete ${selectedIds.size} POIs? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    await supabase.from("points_of_interest").delete().in("id", ids);
    setPois((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
  }

  // ── CSV Export ───────────────────────────────────────────────────────────────

  async function handleExport() {
    const ids = visiblePois.map((p) => p.id);
    if (ids.length === 0) return;

    // Fetch full fields — two queries because the JS client can't call ST_X/ST_Y inline.
    // The `pois` view exposes lat/lng extracted from geom.
    const [{ data: mainData }, { data: coordData }] = await Promise.all([
      supabase
        .from("points_of_interest")
        .select("id, title, description, is_verified, is_visible, prominence, street_address, phone, website_url, tags, source, source_date, review_after, review_note, updated_at, categories(name)")
        .in("id", ids)
        .order("id"),
      supabase
        .from("pois")
        .select("id, lat, lng")
        .in("id", ids),
    ]);

    const coordMap = new Map<number, { lat: number; lng: number }>();
    for (const row of coordData ?? []) coordMap.set(row.id, { lat: row.lat, lng: row.lng });

    const exportRows = (mainData ?? []).map((p: Record<string, unknown>) => {
      const coords = coordMap.get(p.id as number);
      return {
        id:            p.id as number,
        title:         p.title as string,
        description:   p.description as string | null,
        category_name: (p.categories as { name: string } | null)?.name ?? null,
        is_verified:   p.is_verified as boolean,
        is_visible:    (p.is_visible ?? true) as boolean,
        prominence:    p.prominence as string | null,
        street_address: p.street_address as string | null,
        phone:         p.phone as string | null,
        website_url:   p.website_url as string | null,
        tags:          p.tags as string[] | null,
        lat:           coords?.lat ?? null,
        lng:           coords?.lng ?? null,
        source:        p.source as string | null,
        source_date:   p.source_date as string | null,
        review_after:  p.review_after as string | null,
        review_note:   p.review_note as string | null,
        updated_at:    p.updated_at as string,
      };
    });

    const csv = poisToCsv(exportRows);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `pois-export-${date}.csv`);
  }

  // ── CSV Import ───────────────────────────────────────────────────────────────

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setImportPhase("validating");
    setImportErrors([]);
    setImportDiff([]);
    setImportResult(null);
    setImportSkipIds(new Set());

    const text = await file.text();
    const rows = parseCsv(text);
    const categoryNames = new Set(categories.map((c) => c.name));
    const { parsed, errors } = validateCsvRows(rows, categoryNames);

    if (errors.length > 0) {
      setImportErrors(errors);
      setImportPhase("idle");
      return;
    }

    // Fetch current updated_at for all ids in the file
    const existingIds = parsed.map((r) => Number(r.id)).filter(Boolean);
    const dbMap = new Map<number, { updated_at: string }>();
    if (existingIds.length > 0) {
      const { data } = await supabase
        .from("points_of_interest")
        .select("id, updated_at")
        .in("id", existingIds);
      for (const row of data ?? []) {
        dbMap.set(row.id, { updated_at: row.updated_at });
      }
    }

    const diff = buildDiff(parsed, dbMap);
    setImportDiff(diff);
    setImportPhase("preview");
  }

  async function commitImport(overwriteConflicts: boolean) {
    setImportPhase("importing");

    const catNameToId = new Map(categories.map((c) => [c.name, c.id]));
    let updated = 0;
    let created = 0;
    const skipped: CsvRow[] = [];

    for (let i = 0; i < importDiff.length; i++) {
      const { csvRow, status } = importDiff[i];

      if (importSkipIds.has(i)) {
        skipped.push(csvRow);
        continue;
      }
      if (status === "conflict" && !overwriteConflicts) {
        skipped.push(csvRow);
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (csvRow.title)        patch.title        = csvRow.title;
      if (csvRow.description !== undefined) patch.description = csvRow.description || null;
      if (csvRow.category)     patch.category_id  = catNameToId.get(csvRow.category) ?? null;
      if (csvRow.is_verified)  patch.is_verified  = csvRow.is_verified.toLowerCase() === "true";
      if (csvRow.is_visible !== undefined && csvRow.is_visible !== "")
                               patch.is_visible   = csvRow.is_visible.toLowerCase() === "true";
      if (csvRow.prominence)   patch.prominence   = csvRow.prominence || null;
      if (csvRow.street_address !== undefined) patch.street_address = csvRow.street_address || null;
      if (csvRow.phone !== undefined)          patch.phone          = csvRow.phone || null;
      if (csvRow.website_url !== undefined)    patch.website_url    = csvRow.website_url || null;
      if (csvRow.tags !== undefined)           patch.tags           = csvRow.tags ? csvRow.tags.split("|").map((t) => t.trim()).filter(Boolean) : null;
      if (csvRow.source !== undefined)         patch.source         = csvRow.source || null;
      if (csvRow.source_date !== undefined)    patch.source_date    = csvRow.source_date || null;
      if (csvRow.review_after !== undefined)   patch.review_after   = csvRow.review_after || null;
      if (csvRow.review_note !== undefined)    patch.review_note    = csvRow.review_note || null;

      // New POI needs lat/lng → geom
      const id = csvRow.id ? Number(csvRow.id) : null;
      if (!id && csvRow.lat && csvRow.lng) {
        patch.geom = `SRID=4326;POINT(${csvRow.lng} ${csvRow.lat})`;
      }

      if (id) {
        await supabase.from("points_of_interest").update(patch).eq("id", id);
        updated++;
      } else {
        await supabase.from("points_of_interest").insert(patch);
        created++;
      }
    }

    setImportResult({ updated, created, skipped });
    setImportPhase("done");
    // Refresh the list
    await initialLoad();
  }

  function cancelImport() {
    setImportPhase("idle");
    setImportDiff([]);
    setImportErrors([]);
    setImportSkipIds(new Set());
    setImportResult(null);
  }

  function downloadSkipped(skipped: CsvRow[]) {
    // Re-emit as CSV using the same column order
    const header = Object.keys(skipped[0]).join(",");
    const rows = skipped.map((r) => Object.values(r).map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","));
    downloadCsv([header, ...rows].join("\n"), "pois-skipped.csv");
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading…</div>;
  }

  const allVisibleSelected =
    visiblePois.length > 0 && selectedIds.size === visiblePois.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-gray-800">Points of Interest</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {reviewDueCount > 0 && (
            <button
              type="button"
              onClick={() => setReviewOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium border transition-colors ${
                reviewOnly
                  ? "bg-orange-100 border-orange-300 text-orange-800"
                  : "bg-white border-orange-300 text-orange-600 hover:bg-orange-50"
              }`}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
              {reviewDueCount} review{reviewDueCount !== 1 ? "s" : ""} due
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={visiblePois.length === 0}
            className="px-3 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Export CSV ({visiblePois.length})
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 rounded text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Link
            href="/admin/pois/new"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
          >
            + New POI
          </Link>
        </div>
      </div>

      {/* ── Validation errors ── */}
      {importErrors.length > 0 && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm font-medium text-red-700 mb-2">CSV validation failed:</p>
          <ul className="text-xs text-red-600 space-y-0.5 list-disc list-inside">
            {importErrors.map((e, i) => (
              <li key={i}>Row {e.row}, {e.field}: {e.message}</li>
            ))}
          </ul>
          <button
            onClick={() => setImportErrors([])}
            className="mt-2 text-xs text-red-500 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Import preview ── */}
      {importPhase === "preview" && (
        <ImportPreview
          diff={importDiff}
          skipIds={importSkipIds}
          onToggleSkip={(i) =>
            setImportSkipIds((prev) => {
              const next = new Set(prev);
              next.has(i) ? next.delete(i) : next.add(i);
              return next;
            })
          }
          onOverwrite={() => commitImport(true)}
          onSkipConflicts={() => commitImport(false)}
          onCancel={cancelImport}
        />
      )}

      {/* ── Import result ── */}
      {importPhase === "done" && importResult && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-4">
          <p className="text-sm font-medium text-green-700">
            Import complete: {importResult.updated} updated, {importResult.created} created
            {importResult.skipped.length > 0 && `, ${importResult.skipped.length} skipped`}
          </p>
          {importResult.skipped.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">
                Skipped rows:{" "}
                {importResult.skipped.map((r) => `${r.title}${r.id ? ` (id ${r.id})` : ""}`).join(", ")}
              </p>
              <button
                onClick={() => downloadSkipped(importResult.skipped)}
                className="text-xs text-blue-600 hover:underline"
              >
                Download skipped rows as CSV
              </button>
            </div>
          )}
          <button
            onClick={cancelImport}
            className="mt-2 ml-4 text-xs text-gray-500 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Category filter ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-medium text-gray-500">Categories</span>
        <button
          type="button"
          onClick={() => setHideUnverified((v) => !v)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
            hideUnverified
              ? "bg-gray-800 border-gray-800 text-white"
              : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
          }`}
        >
          {hideUnverified ? "Unverified hidden" : "Hide unverified"}
        </button>
        {categories.map((cat) => {
          const hidden = hiddenCatIds.has(cat.id);
          const loaded = cat.loaded;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                if (!loaded) {
                  loadCategory(cat);
                } else {
                  setHiddenCatIds((prev) => {
                    const next = new Set(prev);
                    hidden ? next.delete(cat.id) : next.add(cat.id);
                    return next;
                  });
                }
              }}
              title={!loaded ? `Click to load ${cat.count?.toLocaleString() ?? "?"} records` : undefined}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                !loaded
                  ? "bg-gray-50 border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500"
                  : hidden
                  ? "bg-white border-gray-200 text-gray-300"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: !loaded || hidden ? "#e5e7eb" : (cat.color ?? "#3b82f6"),
                }}
              />
              {cat.name}
              {!loaded && cat.count != null && (
                <span className="ml-0.5 text-gray-300">+{cat.count.toLocaleString()}</span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setHiddenCatIds(new Set())}
          className="text-xs text-blue-600 hover:underline"
        >
          Show loaded
        </button>
        <span className="text-xs text-gray-400 ml-1">
          {visiblePois.length} of {pois.length} loaded
        </span>
      </div>

      {/* ── Batch action bar ── */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm">
          <span className="text-blue-700 font-medium">{selectedIds.size} selected</span>
          <button onClick={() => batchSetVerified(true)}  className="text-blue-600 hover:underline">Verify all</button>
          <button onClick={() => batchSetVerified(false)} className="text-blue-600 hover:underline">Unverify all</button>
          <button onClick={() => batchSetVisible(true)}   className="text-blue-600 hover:underline">Show all</button>
          <button onClick={() => batchSetVisible(false)}  className="text-blue-600 hover:underline">Hide all</button>
          <button onClick={batchDelete} className="text-red-500 hover:underline ml-auto">Delete selected</button>
          <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:underline">Clear</button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="text-right px-2 py-3 text-gray-400 font-medium w-10">#</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Title</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Category</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visiblePois.map((poi, i) => (
              <tr
                key={poi.id}
                className={`hover:bg-gray-50 ${selectedIds.has(poi.id) ? "bg-blue-50" : ""}`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(poi.id)}
                    onChange={() =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        next.has(poi.id) ? next.delete(poi.id) : next.add(poi.id);
                        return next;
                      })
                    }
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-2 py-3 text-right text-gray-400 tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  <Link
                    href={`/admin/pois/${poi.id}/edit`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {poi.title}
                  </Link>
                  {poi.source && (
                    <span className="ml-2 text-xs text-gray-400">{poi.source}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{poi.category_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
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
                    <button
                      onClick={() => toggleVisible(poi.id, poi.is_visible)}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        poi.is_visible
                          ? "bg-blue-50 text-blue-600"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {poi.is_visible ? "Visible" : "Hidden"}
                    </button>
                    {poi.review_after && poi.review_after <= today && (
                      <span
                        title={poi.review_note ?? "Review due"}
                        className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 cursor-help"
                      >
                        Review due
                      </span>
                    )}
                    {poi.review_after && poi.review_after > today && (
                      <span
                        title={poi.review_note ?? `Review after ${poi.review_after}`}
                        className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-600 cursor-help"
                      >
                        Review {poi.review_after}
                      </span>
                    )}
                  </div>
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
            {visiblePois.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-gray-400"
                >
                  {pois.length === 0
                    ? "No unverified POIs."
                    : "No POIs match the current filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Import Preview Component ───────────────────────────────────────────────────

function ImportPreview({
  diff,
  skipIds,
  onToggleSkip,
  onOverwrite,
  onSkipConflicts,
  onCancel,
}: {
  diff: DiffRow[];
  skipIds: Set<number>;
  onToggleSkip: (i: number) => void;
  onOverwrite: () => void;
  onSkipConflicts: () => void;
  onCancel: () => void;
}) {
  const conflicts = diff.filter((r) => r.status === "conflict").length;
  const newRows   = diff.filter((r) => r.status === "new").length;
  const clean     = diff.filter((r) => r.status === "clean").length;
  const manualSkips = skipIds.size;

  return (
    <div className="mb-4 rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-700 font-medium">{diff.length} rows in file</span>
          {newRows   > 0 && <span className="text-green-600">+{newRows} new</span>}
          {clean     > 0 && <span className="text-blue-600">{clean} update</span>}
          {conflicts > 0 && <span className="text-amber-600">⚠ {conflicts} conflict{conflicts !== 1 ? "s" : ""}</span>}
          {manualSkips > 0 && <span className="text-gray-400">{manualSkips} manually skipped</span>}
        </div>
        <div className="flex gap-2">
          {conflicts > 0 ? (
            <>
              <button
                onClick={onSkipConflicts}
                className="px-3 py-1.5 rounded text-sm border border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                Skip conflicts &amp; import
              </button>
              <button
                onClick={onOverwrite}
                className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700"
              >
                Overwrite all &amp; import
              </button>
            </>
          ) : (
            <button
              onClick={onOverwrite}
              className="px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700"
            >
              Import {diff.length - manualSkips} rows
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-gray-400 font-medium w-8">Skip</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Status</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">ID</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Title</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Category</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Verified</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Visible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {diff.map(({ csvRow, status, dbUpdatedAt }, i) => {
              const manuallySkipped = skipIds.has(i);
              const rowClass =
                manuallySkipped ? "bg-gray-50 opacity-50" :
                status === "conflict" ? "bg-amber-50" :
                status === "new" ? "bg-green-50" :
                "";
              return (
                <tr key={i} className={rowClass}>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={manuallySkipped}
                      onChange={() => onToggleSkip(i)}
                      className="rounded border-gray-300"
                      title="Skip this row"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    {status === "conflict" ? (
                      <span className="text-amber-600 font-medium" title={`DB updated_at: ${dbUpdatedAt}`}>
                        ⚠ conflict
                      </span>
                    ) : status === "new" ? (
                      <span className="text-green-600">new</span>
                    ) : (
                      <span className="text-blue-600">update</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-400">{csvRow.id || "—"}</td>
                  <td className="px-3 py-1.5 text-gray-800 font-medium">{csvRow.title}</td>
                  <td className="px-3 py-1.5 text-gray-500">{csvRow.category || "—"}</td>
                  <td className="px-3 py-1.5 text-gray-500">{csvRow.is_verified || "—"}</td>
                  <td className="px-3 py-1.5 text-gray-500">{csvRow.is_visible || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
