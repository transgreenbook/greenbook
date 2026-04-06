#!/usr/bin/env node
/**
 * import-refuge-restrooms.mjs
 *
 * Imports unisex restrooms from the Refuge Restrooms API into Supabase.
 * Filters for: unisex=true, rating >= 75% (upvotes / total votes).
 * Records with zero votes are included (unrated = benefit of the doubt).
 *
 * Modes:
 *   --full   Paginate through all unisex restrooms and upsert everything.
 *            Use this for the initial import or a periodic full refresh.
 *   (default) Fetch records created or updated since yesterday and upsert
 *            only those. Use this for the daily cron.
 *
 * Run:
 *   node scripts/import-refuge-restrooms.mjs         # daily update
 *   node scripts/import-refuge-restrooms.mjs --full  # full import
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/\s+#.*$/, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.resolve(__dirname, '../.env.local'));

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const API_BASE    = 'https://www.refugerestrooms.org/api/v1/restrooms';
const PER_PAGE    = 100;
const MIN_RATING  = 0.75;
const SOURCE      = 'refuge_restrooms';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function meetsRating(r) {
  const total = r.upvote + r.downvote;
  if (total === 0) return true; // unrated — include by default
  return r.upvote / total >= MIN_RATING;
}

function computeRating(r) {
  const total = r.upvote + r.downvote;
  if (total === 0) return null;
  return Math.round((r.upvote / total) * 100) / 100;
}

async function fetchPage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json();
}

async function fetchAllPages(endpoint, params = {}) {
  const results = [];
  let page = 1;
  while (true) {
    const qs = new URLSearchParams({ ...params, per_page: PER_PAGE, page }).toString();
    const data = await fetchPage(`${API_BASE}${endpoint}?${qs}`);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < PER_PAGE) break;
    page++;
  }
  return results;
}

function toPoiRecord(r) {
  const tags = ['unisex'];
  if (r.accessible)     tags.push('ada-accessible');
  if (r.changing_table) tags.push('changing-table');

  const rating = computeRating(r);

  return {
    title:            `RefugeRestroom - ${r.name}`,
    description:      r.directions || null,
    long_description: r.comment    || null,
    geom:             `SRID=4326;POINT(${r.longitude} ${r.latitude})`,
    tags,
    is_verified:      r.approved === true && meetsRating(r),
    effect_scope:     'point',
    is_user_submitted: false,
    attributes: {
      upvotes:  r.upvote,
      downvotes: r.downvote,
      ...(rating !== null && { rating }),
    },
    source:    SOURCE,
    source_id: String(r.id),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const isFullImport = process.argv.includes('--full');
  console.log(`Starting Refuge Restrooms import (${isFullImport ? 'full' : 'daily'})…`);

  // ── Fetch from API ───────────────────────────────────────────────────────
  let raw;
  if (isFullImport) {
    console.log('  Fetching all unisex restrooms…');
    raw = await fetchAllPages('', { unisex: 'true' });
  } else {
    const yesterday = new Date(Date.now() - 86_400_000);
    const day   = yesterday.getUTCDate();
    const month = yesterday.getUTCMonth() + 1;
    const year  = yesterday.getUTCFullYear();
    console.log(`  Fetching records updated since ${year}-${month}-${day}…`);
    raw = await fetchAllPages('/by_date', {
      unisex:  'true',
      updated: 'true',
      day, month, year,
    });
  }

  console.log(`  Fetched ${raw.length} record(s) from API.`);

  // ── Filter by rating ─────────────────────────────────────────────────────
  const filtered = raw.filter(meetsRating);
  console.log(`  ${filtered.length} record(s) meet the ≥${MIN_RATING * 100}% rating threshold.`);

  if (filtered.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  // ── Load existing source_ids so we know insert vs update ─────────────────
  const { data: existing, error: fetchErr } = await supabase
    .from('points_of_interest')
    .select('id, source_id')
    .eq('source', SOURCE);
  if (fetchErr) throw fetchErr;

  const existingMap = new Map((existing ?? []).map(r => [r.source_id, r.id]));

  // ── Upsert ───────────────────────────────────────────────────────────────
  let inserted = 0;
  let updated  = 0;
  let failed   = 0;

  for (const r of filtered) {
    const poi = toPoiRecord(r);
    const existingId = existingMap.get(poi.source_id);

    if (existingId) {
      const { error } = await supabase
        .from('points_of_interest')
        .update(poi)
        .eq('id', existingId);
      if (error) {
        console.warn(`  Update failed for source_id ${poi.source_id}: ${error.message}`);
        failed++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase
        .from('points_of_interest')
        .insert(poi);
      if (error) {
        console.warn(`  Insert failed for source_id ${poi.source_id}: ${error.message}`);
        failed++;
      } else {
        inserted++;
      }
    }
  }

  console.log(`  Inserted: ${inserted}  Updated: ${updated}  Failed: ${failed}`);
  console.log('Done.');
}

main().catch(err => {
  console.error('Import failed:', err?.message ?? err);
  process.exit(1);
});
