#!/usr/bin/env node
/**
 * seed-sheet-from-db.mjs
 *
 * One-time (or re-runnable) script that exports all POIs from Supabase
 * and writes them as rows in the Google Sheet, then back-fills sheet_id
 * in the database so the hourly sync can manage them going forward.
 *
 * Safe to re-run: existing sheet content is replaced, but DB records
 * are only updated where sheet_id is currently NULL.
 *
 * Run: node scripts/seed-sheet-from-db.mjs
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config (same env-loading logic as sync-pois-to-db.mjs)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const val = raw.replace(/\s+#.*$/, '');
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
  if (!val) { console.error(`Missing required env var: ${key}`); process.exit(1); }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const serviceAccountCredentials = JSON.parse(fs.readFileSync(GOOGLE_SERVICE_ACCOUNT_JSON, 'utf8'));
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccountCredentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const HEADERS = [
  'poi_id',
  'title',
  'description',
  'long_description',
  'lat',
  'lng',
  'category',
  'tags',
  'is_verified',
  'website_url',
  'phone',
  'icon',
  'color',
  'effect_scope',
  'prominence',
  'severity',
  'visible_start',
  'visible_end',
  'state_abbr',
  'county_name',
  'city_name',
];

async function fetchAllPOIs() {
  const PAGE = 200;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('points_of_interest')
      .select('id, title, description, long_description, geom, category_id, tags, is_verified, website_url, phone, icon, color, effect_scope, prominence, severity, visible_start, visible_end, state_abbr, county_name, city_name, categories(name)')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function main() {
  console.log(`Fetching POIs from database…`);

  const pois = await fetchAllPOIs();
  console.log(`  Found ${pois.length} POI(s).`);

  // Build sheet rows
  const dataRows = pois.map(p => {
    // geom is returned as GeoJSON: { type: 'Point', coordinates: [lng, lat] }
    const coords = p.geom?.coordinates;
    const lng = coords ? String(coords[0]) : '';
    const lat = coords ? String(coords[1]) : '';
    return [
      String(p.id),                                        // poi_id
      p.title ?? '',
      p.description ?? '',
      p.long_description ?? '',
      lat,
      lng,
      p.categories?.name ?? '',
      Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags ?? ''),
      p.is_verified ? 'TRUE' : 'FALSE',
      p.website_url ?? '',
      p.phone ?? '',
      p.icon ?? '',
      p.color ?? '',
      p.effect_scope ?? 'point',
      p.prominence ?? 'local',
      p.severity != null ? String(p.severity) : '0',
      p.visible_start ? p.visible_start.slice(0, 10) : '',
      p.visible_end   ? p.visible_end.slice(0, 10)   : '',
      p.state_abbr  ?? '',
      p.county_name ?? '',
      p.city_name   ?? '',
    ];
  });

  // Write header + data to sheet (overwrites existing content)
  const range = `${GOOGLE_SHEET_TAB}!A1`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS, ...dataRows] },
  });
  console.log(`  Wrote headers + ${dataRows.length} data row(s) to sheet tab "${GOOGLE_SHEET_TAB}".`);

  if (pois.length === 0) {
    console.log('No POIs in database — headers written, sheet is ready for data entry.');
    return;
  }

  // sheet_id back-fill skipped — column not yet on production DB

  console.log('Done. Run `npm run sync-pois-to-db` to verify the round-trip.');
}

main().catch(err => {
  console.error('Seed failed:', err?.message ?? err);
  process.exit(1);
});
