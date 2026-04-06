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
 *            Pages are upserted as they arrive so progress is never lost
 *            if the API goes down mid-run.
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

const API_BASE   = 'https://www.refugerestrooms.org/api/v1/restrooms';
const PER_PAGE   = 100;
const MIN_RATING = 0.75;
const SOURCE     = 'refuge_restrooms';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function meetsRating(r) {
  const total = r.upvote + r.downvote;
  if (total === 0) return true;
  return r.upvote / total >= MIN_RATING;
}

function computeRating(r) {
  const total = r.upvote + r.downvote;
  if (total === 0) return null;
  return Math.round((r.upvote / total) * 100) / 100;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPageWithRetry(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 503 || res.status === 429) {
      if (attempt < MAX_RETRIES) {
        const wait = RETRY_DELAY_MS * attempt;
        console.warn(`  API ${res.status} on attempt ${attempt}/${MAX_RETRIES}, retrying in ${wait / 1000}s…`);
        await sleep(wait);
        continue;
      }
    }
    throw new Error(`API error ${res.status}: ${url}`);
  }
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
      upvotes:   r.upvote,
      downvotes: r.downvote,
      ...(rating !== null && { rating }),
    },
    source:    SOURCE,
    source_id: String(r.id),
  };
}

// Upsert a batch of raw API records into Supabase.
// seenIds, if provided, will be populated with every source_id processed.
async function upsertBatch(records, existingMap, counters, seenIds = null) {
  for (const r of records) {
    if (!meetsRating(r)) continue;
    const poi = toPoiRecord(r);
    seenIds?.add(poi.source_id);
    const existingId = existingMap.get(poi.source_id);

    if (existingId) {
      const { error } = await supabase
        .from('points_of_interest')
        .update(poi)
        .eq('id', existingId);
      if (error) {
        console.warn(`  Update failed for source_id ${poi.source_id}: ${error.message}`);
        counters.failed++;
      } else {
        counters.updated++;
      }
    } else {
      const { data, error } = await supabase
        .from('points_of_interest')
        .insert(poi)
        .select('id, source_id')
        .single();
      if (error) {
        console.warn(`  Insert failed for source_id ${poi.source_id}: ${error.message}`);
        counters.failed++;
      } else {
        existingMap.set(data.source_id, data.id);
        counters.inserted++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const isFullImport = process.argv.includes('--full');
  console.log(`Starting Refuge Restrooms import (${isFullImport ? 'full' : 'daily'})…`);

  // ── Load existing source_ids up front ────────────────────────────────────
  console.log('  Loading existing refuge_restrooms records from DB…');
  const { data: existing, error: fetchErr } = await supabase
    .from('points_of_interest')
    .select('id, source_id')
    .eq('source', SOURCE);
  if (fetchErr) throw fetchErr;
  const existingMap = new Map((existing ?? []).map(r => [r.source_id, r.id]));
  console.log(`  ${existingMap.size} already in DB.`);

  const counters = { inserted: 0, updated: 0, failed: 0 };

  // ── Full import: fetch + upsert page by page, then prune deletions ──────────
  if (isFullImport) {
    const seenIds = new Set();
    console.log('  Fetching and upserting all unisex restrooms page by page…');
    let page = 1;
    while (true) {
      const qs = new URLSearchParams({ unisex: 'true', per_page: PER_PAGE, page }).toString();
      const data = await fetchPageWithRetry(`${API_BASE}?${qs}`);
      if (!Array.isArray(data) || data.length === 0) break;

      console.log(`  Page ${page} fetched (${data.length} records), upserting…`);
      await upsertBatch(data, existingMap, counters, seenIds);
      console.log(`    → inserted: ${counters.inserted}  updated: ${counters.updated}  failed: ${counters.failed}`);

      if (data.length < PER_PAGE) break;
      page++;
    }

    // ── Prune records no longer in the API ─────────────────────────────────
    const staleIds = [...existingMap.keys()].filter(sid => !seenIds.has(sid));
    if (staleIds.length > 0) {
      console.log(`  Pruning ${staleIds.length} record(s) no longer in the API…`);
      const { error } = await supabase
        .from('points_of_interest')
        .delete()
        .eq('source', SOURCE)
        .in('source_id', staleIds);
      if (error) console.warn(`  Prune failed: ${error.message}`);
      else console.log(`  Pruned ${staleIds.length} stale record(s).`);
    } else {
      console.log('  No stale records to prune.');
    }

  // ── Daily update: fetch all updated records, then upsert ─────────────────
  } else {
    const yesterday = new Date(Date.now() - 86_400_000);
    const day   = yesterday.getUTCDate();
    const month = yesterday.getUTCMonth() + 1;
    const year  = yesterday.getUTCFullYear();
    console.log(`  Fetching records updated since ${year}-${month}-${day}…`);

    let page = 1;
    let total = 0;
    while (true) {
      const qs = new URLSearchParams({ unisex: 'true', updated: 'true', day, month, year, per_page: PER_PAGE, page }).toString();
      const data = await fetchPageWithRetry(`${API_BASE}/by_date?${qs}`);
      if (!Array.isArray(data) || data.length === 0) break;
      total += data.length;
      await upsertBatch(data, existingMap, counters);
      if (data.length < PER_PAGE) break;
      page++;
    }
    console.log(`  Fetched ${total} record(s) from API.`);
  }

  console.log(`  Inserted: ${counters.inserted}  Updated: ${counters.updated}  Failed: ${counters.failed}`);
  console.log('Done.');
}

main().catch(err => {
  console.error('Import failed:', err?.message ?? err);
  process.exit(1);
});
