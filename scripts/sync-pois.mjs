#!/usr/bin/env node
/**
 * sync-pois.mjs
 *
 * Reads POI data from a Google Sheet and syncs it to Supabase.
 *
 * Expected sheet columns (header row, case-insensitive):
 *   poi_id           – DB id written back by this script. Leave blank for new rows.
 *   title            – POI name (required)
 *   description      – Short description
 *   long_description – Full detail text
 *   lat              – Latitude  (required)
 *   lng              – Longitude (required)
 *   category         – Category name (must match a row in the categories table)
 *   tags             – Comma-separated tags  e.g. "food, outdoor"
 *   is_verified      – TRUE / FALSE  (controls public visibility)
 *   website_url      – Optional URL
 *   phone            – Phone number
 *   icon             – Icon slug
 *   severity         – Integer -10 to 10 (default 0)
 *   visible_start    – ISO date e.g. 2026-06-01 (leave blank = always visible)
 *   visible_end      – ISO date e.g. 2026-08-31 (leave blank = no expiry)
 *
 * Run manually:  node scripts/sync-pois.mjs
 * Run via timer: systemctl --user start greenbook-sync.service
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local without a dotenv dependency.
// Real env vars (already set) always win.
function loadEnvFile(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.resolve(__dirname, '../.env.local'));

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  GOOGLE_SHEET_ID,
  GOOGLE_SHEET_TAB = 'POIs',
} = process.env;

for (const [key, val] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  GOOGLE_SHEET_ID,
})) {
  if (!val) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const serviceAccountCredentials = JSON.parse(
  fs.readFileSync(GOOGLE_SERVICE_ACCOUNT_JSON, 'utf8')
);
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountCredentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Convert 0-based column index to sheet letter (0→A, 25→Z, 26→AA, …)
function colLetter(idx) {
  let letter = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function parseBool(val) {
  return String(val).trim().toLowerCase() === 'true';
}

function parseTags(val) {
  if (!val?.trim()) return null;
  const tags = val.split(',').map(t => t.trim()).filter(Boolean);
  return tags.length ? tags : null;
}

function parseTimestamp(val) {
  if (!val?.trim()) return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseSeverity(val) {
  if (!val?.trim()) return 0;
  const n = parseInt(val.trim(), 10);
  if (isNaN(n)) return 0;
  return Math.max(-10, Math.min(10, n));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] Starting POI sync from sheet "${GOOGLE_SHEET_TAB}"…`);

  // ── Load categories ──────────────────────────────────────────────────────
  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, name');
  if (catErr) throw catErr;
  const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

  // ── Read sheet ───────────────────────────────────────────────────────────
  const { data: sheetData } = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${GOOGLE_SHEET_TAB}!A:Z`,
  });

  const rows = sheetData.values ?? [];
  if (rows.length < 2) {
    console.log('Sheet has no data rows. Nothing to sync.');
    return;
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map(h => String(h).trim().toLowerCase());

  // Required columns throw; optional columns return -1
  const col = (name, required = true) => {
    const idx = headers.indexOf(name.toLowerCase());
    if (idx === -1 && required) throw new Error(`Sheet is missing required column: "${name}"`);
    return idx;
  };

  const C = {
    poi_id:           col('poi_id'),
    title:            col('title'),
    description:      col('description'),
    long_description: col('long_description'),
    lat:              col('lat'),
    lng:              col('lng'),
    category:         col('category'),
    tags:             col('tags'),
    is_verified:      col('is_verified'),
    website_url:      col('website_url'),
    phone:            col('phone'),
    icon:             col('icon'),
    severity:         col('severity'),
    visible_start:    col('visible_start'),
    visible_end:      col('visible_end'),
  };

  const get = (row, c) => c === -1 ? '' : String(row[c] ?? '').trim();

  // ── Process rows ─────────────────────────────────────────────────────────
  let upserted = 0;
  let inserted = 0;
  const presentSheetIds = new Set();
  const writebacks = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const sheetRowNumber = i + 2; // 1-based; row 1 is the header

    const title  = get(row, C.title);
    const latStr = get(row, C.lat);
    const lngStr = get(row, C.lng);

    if (!title || !latStr || !lngStr) continue; // skip blank/incomplete rows

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) {
      console.warn(`  Row ${sheetRowNumber} skipped: invalid lat/lng ("${latStr}", "${lngStr}")`);
      continue;
    }

    const categoryName = get(row, C.category);
    const poi = {
      title,
      description:      get(row, C.description)      || null,
      long_description: get(row, C.long_description) || null,
      geom:             `SRID=4326;POINT(${lng} ${lat})`,
      category_id:      categoryName ? (categoryMap.get(categoryName.toLowerCase()) ?? null) : null,
      tags:             parseTags(get(row, C.tags)),
      is_verified:      parseBool(get(row, C.is_verified)),
      website_url:      get(row, C.website_url)  || null,
      phone:            get(row, C.phone)         || null,
      icon:             get(row, C.icon)          || null,
      severity:         parseSeverity(get(row, C.severity)),
      visible_start:    parseTimestamp(get(row, C.visible_start)),
      visible_end:      parseTimestamp(get(row, C.visible_end)),
      scope:            'point',
    };

    const poiId = get(row, C.poi_id);

    if (poiId) {
      // ── Update existing row ──────────────────────────────────────────────
      presentSheetIds.add(poiId);
      const { error } = await supabase
        .from('points_of_interest')
        .upsert({ id: Number(poiId), sheet_id: poiId, ...poi }, { onConflict: 'id' });

      if (error) {
        console.warn(`  Row ${sheetRowNumber} (${title}) upsert failed: ${error.message}`);
      } else {
        upserted++;
      }
    } else {
      // ── Insert new row ───────────────────────────────────────────────────
      const { data: newRow, error } = await supabase
        .from('points_of_interest')
        .insert(poi)
        .select('id')
        .single();

      if (error) {
        console.warn(`  Row ${sheetRowNumber} (${title}) insert failed: ${error.message}`);
        continue;
      }

      const newId = String(newRow.id);
      presentSheetIds.add(newId);

      await supabase
        .from('points_of_interest')
        .update({ sheet_id: newId })
        .eq('id', newRow.id);

      writebacks.push({
        range: `${GOOGLE_SHEET_TAB}!${colLetter(C.poi_id)}${sheetRowNumber}`,
        values: [[newId]],
      });
      inserted++;
    }
  }

  // ── Write back new poi_ids to sheet ──────────────────────────────────────
  if (writebacks.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: writebacks },
    });
    console.log(`  Inserted ${inserted} new POI(s) and wrote IDs back to sheet.`);
  } else if (inserted > 0) {
    console.log(`  Inserted ${inserted} new POI(s).`);
  }

  if (upserted > 0) {
    console.log(`  Updated ${upserted} existing POI(s).`);
  }

  // ── Soft-delete rows removed from sheet ──────────────────────────────────
  if (presentSheetIds.size > 0) {
    const { data: allLinked } = await supabase
      .from('points_of_interest')
      .select('id, sheet_id')
      .not('sheet_id', 'is', null);

    const orphans = (allLinked ?? []).filter(r => !presentSheetIds.has(r.sheet_id));
    if (orphans.length) {
      await supabase
        .from('points_of_interest')
        .update({ is_verified: false })
        .in('id', orphans.map(r => r.id));
      console.log(`  Unpublished ${orphans.length} POI(s) removed from sheet.`);
    }
  }

  console.log(`[${new Date().toISOString()}] Sync complete.`);
}

main().catch(err => {
  console.error('Sync failed:', err?.message ?? err);
  process.exit(1);
});
