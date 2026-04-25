/**
 * CSV export / import utilities for admin POI bulk editing.
 *
 * Column order in the CSV:
 *   id, title, description, category, is_verified, is_visible, prominence,
 *   street_address, phone, website_url, tags, lat, lng,
 *   source, source_date, review_after, review_note, updated_at
 *
 * Rules:
 *   - id blank → create new POI on import
 *   - id present → update existing row (checked against updated_at for conflicts)
 *   - tags stored as pipe-separated string ("foo|bar") inside the CSV cell
 *   - updated_at is read-only on import (used only for conflict detection)
 */

export const CSV_COLUMNS = [
  "id",
  "title",
  "description",
  "category",
  "is_verified",
  "is_visible",
  "prominence",
  "street_address",
  "phone",
  "website_url",
  "tags",
  "lat",
  "lng",
  "source",
  "source_date",
  "review_after",
  "review_note",
  "updated_at",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface CsvRow {
  id: string;
  title: string;
  description: string;
  category: string;
  is_verified: string;
  is_visible: string;
  prominence: string;
  street_address: string;
  phone: string;
  website_url: string;
  tags: string;
  lat: string;
  lng: string;
  source: string;
  source_date: string;
  review_after: string;
  review_note: string;
  updated_at: string;
}

// ── Export ────────────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  // Quote if contains comma, newline, double-quote, or leading/trailing whitespace
  if (/[",\n\r]/.test(s) || s !== s.trim()) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export interface ExportPOI {
  id: number;
  title: string;
  description: string | null;
  category_name: string | null;
  is_verified: boolean;
  is_visible: boolean;
  prominence: string | null;
  street_address: string | null;
  phone: string | null;
  website_url: string | null;
  tags: string[] | null;
  lat: number | null;
  lng: number | null;
  source: string | null;
  source_date: string | null;
  review_after: string | null;
  review_note: string | null;
  updated_at: string;
}

export function poisToCsv(pois: ExportPOI[]): string {
  const header = buildCsvLine([...CSV_COLUMNS]);
  const rows = pois.map((p) =>
    buildCsvLine([
      p.id,
      p.title,
      p.description ?? "",
      p.category_name ?? "",
      p.is_verified,
      p.is_visible,
      p.prominence ?? "",
      p.street_address ?? "",
      p.phone ?? "",
      p.website_url ?? "",
      (p.tags ?? []).join("|"),
      p.lat ?? "",
      p.lng ?? "",
      p.source ?? "",
      p.source_date ?? "",
      p.review_after ?? "",
      p.review_note ?? "",
      p.updated_at,
    ])
  );
  return [header, ...rows].join("\n");
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Parse ─────────────────────────────────────────────────────────────────────

/** Minimal RFC-4180 CSV parser that handles quoted fields with embedded commas/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field); field = "";
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[i + 1] === "\n") i++; // CRLF
        row.push(field); field = "";
        if (row.some((c) => c !== "")) rows.push(row); // skip blank lines
        row = [];
      } else {
        field += ch;
      }
    }
    i++;
  }
  // Last field / row
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

// ── Validate ──────────────────────────────────────────────────────────────────

export type ValidationError = { row: number; field: string; message: string };

const VALID_PROMINENCE = new Set(["national", "regional", "local", "neighborhood", ""]);

export function validateCsvRows(
  rows: string[][],
  categoryNames: Set<string>
): { parsed: CsvRow[]; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (rows.length === 0) {
    errors.push({ row: 0, field: "file", message: "File is empty" });
    return { parsed: [], errors };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex: Partial<Record<CsvColumn, number>> = {};
  for (const col of CSV_COLUMNS) {
    const idx = header.indexOf(col);
    if (idx !== -1) colIndex[col] = idx;
  }

  const required: CsvColumn[] = ["title"];
  for (const col of required) {
    if (colIndex[col] === undefined) {
      errors.push({ row: 0, field: col, message: `Missing required column: ${col}` });
    }
  }
  if (errors.length) return { parsed: [], errors };

  const get = (dataRow: string[], col: CsvColumn): string =>
    colIndex[col] !== undefined ? (dataRow[colIndex[col]] ?? "").trim() : "";

  const parsed: CsvRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const dataRow = rows[r];
    const rowNum = r + 1; // 1-based for display

    const id = get(dataRow, "id");
    const title = get(dataRow, "title");
    const category = get(dataRow, "category");
    const isVerified = get(dataRow, "is_verified");
    const isVisible = get(dataRow, "is_visible");
    const prominence = get(dataRow, "prominence");
    const lat = get(dataRow, "lat");
    const lng = get(dataRow, "lng");

    if (!title) {
      errors.push({ row: rowNum, field: "title", message: "Title is required" });
    }
    if (id && isNaN(Number(id))) {
      errors.push({ row: rowNum, field: "id", message: `id must be a number, got: ${id}` });
    }
    if (category && !categoryNames.has(category)) {
      errors.push({ row: rowNum, field: "category", message: `Unknown category: "${category}"` });
    }
    if (isVerified && !["true", "false", ""].includes(isVerified.toLowerCase())) {
      errors.push({ row: rowNum, field: "is_verified", message: `is_verified must be true/false` });
    }
    if (isVisible && !["true", "false", ""].includes(isVisible.toLowerCase())) {
      errors.push({ row: rowNum, field: "is_visible", message: `is_visible must be true/false` });
    }
    if (!VALID_PROMINENCE.has(prominence.toLowerCase())) {
      errors.push({ row: rowNum, field: "prominence", message: `prominence must be national/regional/local/neighborhood` });
    }
    if (lat && isNaN(Number(lat))) {
      errors.push({ row: rowNum, field: "lat", message: `lat must be a number` });
    }
    if (lng && isNaN(Number(lng))) {
      errors.push({ row: rowNum, field: "lng", message: `lng must be a number` });
    }
    if ((lat && !lng) || (!lat && lng)) {
      errors.push({ row: rowNum, field: "lat/lng", message: "lat and lng must both be set or both be empty" });
    }

    parsed.push({
      id,
      title: get(dataRow, "title"),
      description: get(dataRow, "description"),
      category,
      is_verified: isVerified,
      is_visible: isVisible,
      prominence,
      street_address: get(dataRow, "street_address"),
      phone: get(dataRow, "phone"),
      website_url: get(dataRow, "website_url"),
      tags: get(dataRow, "tags"),
      lat,
      lng,
      source: get(dataRow, "source"),
      source_date: get(dataRow, "source_date"),
      review_after: get(dataRow, "review_after"),
      review_note: get(dataRow, "review_note"),
      updated_at: get(dataRow, "updated_at"),
    });
  }

  return { parsed, errors };
}

// ── Conflict detection ────────────────────────────────────────────────────────

export type ConflictStatus = "new" | "clean" | "conflict";

export interface DiffRow {
  csvRow: CsvRow;
  status: ConflictStatus;
  /** updated_at from the current DB record (for existing rows) */
  dbUpdatedAt?: string;
}

export function buildDiff(
  parsed: CsvRow[],
  dbRecords: Map<number, { updated_at: string }>
): DiffRow[] {
  return parsed.map((csvRow) => {
    const id = csvRow.id ? Number(csvRow.id) : null;
    if (!id) return { csvRow, status: "new" };
    const db = dbRecords.get(id);
    if (!db) return { csvRow, status: "new" }; // id not in DB → treat as new
    if (db.updated_at === csvRow.updated_at) return { csvRow, status: "clean", dbUpdatedAt: db.updated_at };
    return { csvRow, status: "conflict", dbUpdatedAt: db.updated_at };
  });
}
