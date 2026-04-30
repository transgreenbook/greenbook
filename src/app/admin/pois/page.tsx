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
import { severityColor } from "@/hooks/useRegionColors";

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
  state_abbr: string | null;
  source: string | null;
  review_after: string | null;
  review_note: string | null;
  severity: number;
  color: string | null;
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
  const [verifiedFilter, setVerifiedFilter] = useState<"both" | "verified" | "unverified">("both");
  const [visibilityFilter, setVisibilityFilter] = useState<"both" | "visible" | "hidden">("both");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"all" | "negative" | "neutral" | "positive">("all");
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

  // ── Reset loaded state when state filter changes ────────────────────────────
  // Categories may have been loaded without a state filter (or for a different
  // state). When the filter changes, mark all as needing reload so that group
  // toggle buttons re-fetch with the correct state scope.
  useEffect(() => {
    if (loading) return;
    setCategories((prev) => prev.map((c) => ({ ...c, loaded: false })));
  }, [selectedState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist filters across navigation ───────────────────────────────────────

  const FILTER_KEY = "admin-poi-filters";

  // Save all filter state (including which category chips are loaded) so that
  // initialLoad can fully restore the page after any navigation.
  useEffect(() => {
    if (loading) return;
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
      hiddenCatIds:  Array.from(hiddenCatIds),
      verifiedFilter,
      visibilityFilter,
      reviewOnly,
      selectedState,
      severityFilter,
      loadedCatIds:  categories.filter((c) => c.loaded).map((c) => c.id),
    }));
  }, [hiddenCatIds, verifiedFilter, visibilityFilter, reviewOnly, selectedState, severityFilter, loading, categories]);

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

    const POI_SELECT = "id, title, is_verified, is_visible, created_at, updated_at, category_id, categories(name), state_abbr, source, review_after, review_note, severity, color";

    // 2. Restore saved filters (or apply defaults)
    const saved = sessionStorage.getItem(FILTER_KEY);
    let savedLoadedCatIds: number[] = [];
    if (saved) {
      const { hiddenCatIds: savedHidden, verifiedFilter: savedVerified, visibilityFilter: savedVisibility, reviewOnly: savedReview, selectedState: savedState, severityFilter: savedSeverity, loadedCatIds: savedLoaded } = JSON.parse(saved);
      setHiddenCatIds(new Set(savedHidden as number[]));
      if (savedVerified)  setVerifiedFilter(savedVerified as "both" | "verified" | "unverified");
      if (savedVisibility) setVisibilityFilter(savedVisibility as "both" | "visible" | "hidden");
      if (savedSeverity)  setSeverityFilter(savedSeverity as "all" | "negative" | "neutral" | "positive");
      setReviewOnly(savedReview);
      setSelectedState(savedState ?? null);
      savedLoadedCatIds = (savedLoaded as number[] | undefined) ?? [];
    } else {
      setHiddenCatIds(new Set(cats.filter((c) => c.bulk).map((c) => c.id)));
    }

    // 3. Load unverified POIs (baseline) + any previously loaded categories in parallel
    const nonBulkCatIds   = cats.filter((c) => !c.bulk).map((c) => c.id);
    const toReloadCatIds  = savedLoadedCatIds.filter((id) => cats.some((c) => c.id === id && !c.bulk));

    const fetches = [
      supabase
        .from("points_of_interest")
        .select(POI_SELECT)
        .eq("is_verified", false)
        .in("category_id", nonBulkCatIds)
        .order("created_at", { ascending: false })
        .then(({ data }) => mapPOIs(data ?? [])),
    ];

    if (toReloadCatIds.length > 0) {
      fetches.push(
        supabase
          .from("points_of_interest")
          .select(POI_SELECT)
          .in("category_id", toReloadCatIds)
          .order("created_at", { ascending: false })
          .then(({ data }) => mapPOIs(data ?? []))
      );
    }

    const results = await Promise.all(fetches);
    const seen = new Set<number>();
    const merged: POI[] = [];
    for (const batch of results) {
      for (const p of batch) {
        if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
      }
    }
    setPois(merged);

    // Mark reloaded categories as loaded
    if (toReloadCatIds.length > 0) {
      const reloadedSet = new Set(toReloadCatIds);
      setCategories((prev) => prev.map((c) => reloadedSet.has(c.id) ? { ...c, loaded: true } : c));
    }

    // Clear any pending refresh flag (in case this is a post-save remount)
    sessionStorage.removeItem("poi-list-needs-refresh");

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
      state_abbr:    p.state_abbr as string | null,
      source:        p.source as string | null,
      review_after:  p.review_after as string | null,
      review_note:   p.review_note as string | null,
      severity:      (p.severity as number) ?? 0,
      color:         p.color as string | null,
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

    let q = supabase
      .from("points_of_interest")
      .select("id, title, is_verified, is_visible, created_at, updated_at, category_id, categories(name), state_abbr, source, review_after, review_note")
      .eq("category_id", cat.id)
      .order("created_at", { ascending: false });
    if (selectedState) q = q.eq("state_abbr", selectedState);
    const { data } = await q;

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
    .filter((p) => verifiedFilter === "both" || (verifiedFilter === "verified" ? p.is_verified : !p.is_verified))
    .filter((p) => visibilityFilter === "both" || (visibilityFilter === "visible" ? p.is_visible : !p.is_visible))
    .filter((p) => !selectedState || p.state_abbr === selectedState)
    .filter((p) => !reviewOnly || (p.review_after && p.review_after <= today))
    .filter((p) =>
      severityFilter === "all"      ? true :
      severityFilter === "negative" ? p.severity < 0 :
      severityFilter === "positive" ? p.severity > 0 :
      p.severity === 0
    );

  // Distinct states from loaded POIs for the dropdown
  const availableStates = Array.from(
    new Set(pois.map((p) => p.state_abbr).filter(Boolean))
  ).sort() as string[];

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
      {(() => {
        const lawCats    = categories.filter((c) => c.name.startsWith("Law —"));
        const policyCats = categories.filter((c) => c.name.startsWith("Policy Rating —"));
        const otherCats  = categories.filter((c) => !c.name.startsWith("Law —") && !c.name.startsWith("Policy Rating —"));

        async function toggleGroup(group: Category[]) {
          const unloaded = group.filter((c) => !c.loaded && !c.bulk);
          if (unloaded.length > 0) {
            // Load all unloaded categories — loadCategory already makes them visible
            const totalCount = unloaded.reduce((sum, c) => sum + (c.count ?? 0), 0);
            if (
              totalCount > LOAD_WARNING_THRESHOLD &&
              !confirm(`Loading will add ${totalCount.toLocaleString()} records. Continue?`)
            ) return;
            await Promise.all(unloaded.map((c) => loadCategory(c)));
            return;
          }
          // All already loaded — toggle visibility
          const anyVisible = group.some((c) => !hiddenCatIds.has(c.id));
          setHiddenCatIds((prev) => {
            const next = new Set(prev);
            for (const c of group) anyVisible ? next.add(c.id) : next.delete(c.id);
            return next;
          });
        }

        function GroupToggle({ label, group, color }: { label: string; group: Category[]; color: string }) {
          const anyVisible = group.some((c) => c.loaded && !hiddenCatIds.has(c.id));
          return (
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-colors shrink-0 ${
                anyVisible
                  ? "text-white border-transparent"
                  : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
              }`}
              style={anyVisible ? { backgroundColor: color, borderColor: color } : undefined}
              title={anyVisible ? `Hide all ${label}` : `Show all ${label}`}
            >
              {label}
            </button>
          );
        }

        function CatChip({ cat }: { cat: Category }) {
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
                style={{ backgroundColor: !loaded || hidden ? "#e5e7eb" : (cat.color ?? "#3b82f6") }}
              />
              {cat.name.replace(/^Law — /, "").replace(/^Policy Rating — /, "")}
              {!loaded && cat.count != null && (
                <span className="ml-0.5 text-gray-300">+{cat.count.toLocaleString()}</span>
              )}
            </button>
          );
        }

        return (
          <div className="space-y-1.5 mb-4">

            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedState ?? ""}
                onChange={(e) => setSelectedState(e.target.value || null)}
                className="text-xs border border-gray-200 rounded px-2 py-0.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">All states</option>
                {availableStates.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as "all" | "negative" | "neutral" | "positive")}
                className="text-xs border border-gray-200 rounded px-2 py-0.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="all">All severity</option>
                <option value="negative">Negative</option>
                <option value="neutral">Neutral (0)</option>
                <option value="positive">Positive</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setVerifiedFilter((v) =>
                    v === "both" ? "verified" : v === "verified" ? "unverified" : "both"
                  )
                }
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  verifiedFilter === "verified"
                    ? "bg-green-600 border-green-600 text-white"
                    : verifiedFilter === "unverified"
                    ? "bg-gray-700 border-gray-700 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                {verifiedFilter === "verified"
                  ? "Verified only"
                  : verifiedFilter === "unverified"
                  ? "Unverified only"
                  : "All verified"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setVisibilityFilter((v) =>
                    v === "both" ? "visible" : v === "visible" ? "hidden" : "both"
                  )
                }
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  visibilityFilter === "visible"
                    ? "bg-blue-600 border-blue-600 text-white"
                    : visibilityFilter === "hidden"
                    ? "bg-gray-700 border-gray-700 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                {visibilityFilter === "visible"
                  ? "Visible only"
                  : visibilityFilter === "hidden"
                  ? "Hidden only"
                  : "All visibility"}
              </button>
              <button
                type="button"
                onClick={() => setHiddenCatIds(new Set())}
                className="text-xs text-blue-600 hover:underline"
              >
                Show all
              </button>
              <span className="text-xs text-gray-400">
                {visiblePois.length} of {pois.length} loaded
              </span>
            </div>

            {/* Law row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <GroupToggle label="All Laws" group={lawCats} color="#4f46e5" />
              {lawCats.map((cat) => <CatChip key={cat.id} cat={cat} />)}
            </div>

            {/* Policy Rating row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <GroupToggle label="All Policy" group={policyCats} color="#0891b2" />
              {policyCats.map((cat) => <CatChip key={cat.id} cat={cat} />)}
            </div>

            {/* Other categories */}
            {otherCats.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-gray-400 shrink-0">Other</span>
                {otherCats.map((cat) => <CatChip key={cat.id} cat={cat} />)}
              </div>
            )}

          </div>
        );
      })()}

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
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Visible</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visiblePois.map((poi, i) => (
              <tr
                key={poi.id}
                className={`hover:brightness-95 ${selectedIds.has(poi.id) ? "bg-blue-50" : ""}`}
                style={!selectedIds.has(poi.id) ? { backgroundColor: severityColor(poi.severity, null, 40) ?? undefined } : undefined}
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
                <td className="px-4 py-3 text-gray-500">
                  {poi.category_name ?? "—"}
                  {poi.state_abbr && (
                    <span className="ml-2 text-xs text-gray-400">{poi.state_abbr}</span>
                  )}
                </td>
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
                <td className="px-4 py-3">
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
                  colSpan={8}
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
