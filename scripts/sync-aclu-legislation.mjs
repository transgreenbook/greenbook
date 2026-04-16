#!/usr/bin/env node
/**
 * sync-aclu-legislation.mjs
 *
 * Fetches the ACLU anti-LGBTQ legislation tracker CSV, normalizes each bill,
 * and upserts into the legislation_bills table. Creates digest findings for:
 *   - New bills not previously seen
 *   - Existing bills whose status has changed
 *
 * Required env vars (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   node scripts/sync-aclu-legislation.mjs
 *   node scripts/sync-aclu-legislation.mjs --dry-run   # parse + diff, no DB writes
 *   node scripts/sync-aclu-legislation.mjs --debug     # print normalized rows
 */

import { createClient } from '@supabase/supabase-js';
import fs               from 'node:fs';
import path             from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

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

loadEnvFile(path.resolve(ROOT, '.env.local'));

const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG   = process.argv.includes('--debug');

const ACLU_CSV_URL = 'https://www.aclu.org/wp-json/api/legislation/csv/107155';

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// State name → abbreviation
// ---------------------------------------------------------------------------

const STATE_ABBR = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Hawaiʻi': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
  'Puerto Rico': 'PR', 'Guam': 'GU', 'U.S. Virgin Islands': 'VI',
};

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalize bill number for use as a dedup key.
 * "S.B. 1264" → "SB 1264"   "H.B.42" → "HB 42"   "HB 42" → "HB 42"
 */
function normalizeBillNumber(raw) {
  return raw
    .replace(/\./g, '')          // strip periods
    .replace(/\s+/g, ' ')        // collapse whitespace
    .replace(/([A-Z]+)(\d)/, '$1 $2')  // ensure space between letters and digits
    .trim()
    .toUpperCase();
}

/**
 * Normalize ACLU status string to our internal values.
 */
function normalizeStatus(raw) {
  const s = (raw ?? '').toLowerCase().trim();
  if (s.includes('passed into law') || s.includes('signed'))  return 'signed';
  if (s.includes('passed'))                                    return 'passed';
  if (s.includes('defeated') || s.includes('failed'))         return 'defeated';
  if (s.includes('vetoed'))                                    return 'vetoed';
  if (s.includes('enjoined') || s.includes('court'))          return 'enjoined';
  if (s.includes('advancing') || s.includes('introduced'))    return 'advancing';
  return 'unknown';
}

/**
 * Normalize ACLU issues pipe-separated string to a clean string array.
 * "Healthcare age restrictions | Healthcare restrictions" →
 *   ["healthcare_age_restrictions", "healthcare_restrictions"]
 */
function normalizeIssues(raw) {
  if (!raw) return [];
  return raw
    .split('|')
    .map((s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
    .filter(Boolean);
}

/**
 * Build a Trans Legislation Tracker URL for a bill.
 * Pattern: https://translegislation.com/bills/{year}/{state}/{billCode}
 * where billCode strips dots/spaces and zero-pads the numeric suffix to 4 digits.
 * e.g. "H.928" → "H0928",  "SB 1264" → "SB1264",  "HB 42" → "HB0042"
 *
 * Year is derived from statusDate if provided, otherwise current year.
 * Note: may not match if a bill's session year differs from its last status date year.
 */
function buildTrackerUrl(stateAbbr, billNumber, statusDate) {
  if (!stateAbbr || !billNumber) return null;
  const year = statusDate ? statusDate.slice(0, 4) : new Date().getFullYear().toString();
  // Strip dots and spaces, then split into letter prefix + numeric suffix
  const compact = billNumber.replace(/[\s.]/g, '').toUpperCase();
  const match   = compact.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const [, letters, digits] = match;
  const paddedDigits = digits.padStart(4, '0');
  return `https://translegislation.com/bills/${year}/${stateAbbr}/${letters}${paddedDigits}`;
}

/**
 * Parse MM/DD/YYYY → YYYY-MM-DD, or return null.
 */
function parseDate(raw) {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// CSV parser (no external dependency)
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map((line) => {
    // Handle quoted fields containing commas
    const fields = [];
    let cur = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { fields.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    fields.push(cur.trim());

    return Object.fromEntries(headers.map((h, i) => [h, fields[i] ?? '']));
  });
}

// ---------------------------------------------------------------------------
// Fetch + parse ACLU CSV (with ETag/Last-Modified conditional request)
// ---------------------------------------------------------------------------

/**
 * Fetch the ACLU CSV, using conditional headers if we have cached ones.
 * Returns { rows, etag, lastModified } on success, or { unchanged: true } if
 * the server returned 304 Not Modified.
 */
async function fetchAcluBills(cachedEtag, cachedLastModified) {
  console.log(`Fetching ACLU CSV from ${ACLU_CSV_URL} …`);

  const headers = { 'User-Agent': 'TransSafeTravels-Sync/1.0' };
  if (cachedEtag)         headers['If-None-Match']     = cachedEtag;
  if (cachedLastModified) headers['If-Modified-Since'] = cachedLastModified;

  const resp = await fetch(ACLU_CSV_URL, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (resp.status === 304) {
    console.log('  304 Not Modified — CSV unchanged since last sync.');
    return { unchanged: true };
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const etag         = resp.headers.get('etag')          ?? null;
  const lastModified = resp.headers.get('last-modified') ?? null;
  const text         = await resp.text();
  const rows         = parseCsv(text);
  console.log(`  ${rows.length} rows parsed (ETag: ${etag ?? 'none'}, Last-Modified: ${lastModified ?? 'none'})`);
  return { rows, etag, lastModified };
}

// ---------------------------------------------------------------------------
// Trans Legislation Tracker URL verification
// ---------------------------------------------------------------------------

const TRACKER_CONCURRENCY = 8;    // parallel HEAD requests
const TRACKER_BATCH_DELAY = 500;  // ms between batches

/**
 * Verify a list of candidate tracker URLs in parallel batches.
 * Returns a Map of url → status code (200, 404, 429, 503, 0 for network error).
 * Aborts remaining checks if a rate-limit response (429 or 503) is received.
 */
async function verifyTrackerUrls(urls) {
  const results = new Map();
  let rateLimited = false;

  for (let i = 0; i < urls.length; i += TRACKER_CONCURRENCY) {
    if (rateLimited) {
      // Mark remaining as unchecked (null status — will retry next run)
      console.log(`  Rate limited — skipping remaining ${urls.length - i} URL checks.`);
      break;
    }

    const batch = urls.slice(i, i + TRACKER_CONCURRENCY);
    const checks = batch.map(async (url) => {
      try {
        const resp = await fetch(url, {
          method:  'HEAD',
          headers: { 'User-Agent': 'TransSafeTravels-Sync/1.0' },
          signal:  AbortSignal.timeout(8_000),
          redirect: 'follow',
        });
        results.set(url, resp.status);
        if (resp.status === 429 || resp.status === 503) rateLimited = true;
      } catch {
        results.set(url, 0); // network error / timeout
      }
    });

    await Promise.all(checks);

    const found    = batch.filter((u) => results.get(u) === 200).length;
    const notFound = batch.filter((u) => results.get(u) === 404).length;
    const errors   = batch.filter((u) => (results.get(u) ?? 0) <= 0).length;
    const limited  = batch.filter((u) => results.get(u) === 429 || results.get(u) === 503).length;
    console.log(`  Batch ${Math.floor(i / TRACKER_CONCURRENCY) + 1}: ${found} found, ${notFound} not tracked${errors ? `, ${errors} errors` : ''}${limited ? `, ${limited} rate limited` : ''}`);

    if (i + TRACKER_CONCURRENCY < urls.length && !rateLimited) {
      await new Promise((r) => setTimeout(r, TRACKER_BATCH_DELAY));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const runDate = new Date().toISOString().slice(0, 10);
  console.log(`\nACLU Legislation Sync — ${runDate}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  // 1. Load cached ETag/Last-Modified from last successful sync
  let cachedEtag = null, cachedLastModified = null;
  if (!DRY_RUN) {
    const { data: lastRun } = await supabase
      .from('digest_runs')
      .select('attributes')
      .eq('attributes->>source', 'aclu_sync')
      .not('attributes->etag', 'is', null)
      .order('run_at', { ascending: false })
      .limit(1)
      .single();
    if (lastRun?.attributes) {
      cachedEtag         = lastRun.attributes.etag          ?? null;
      cachedLastModified = lastRun.attributes.last_modified ?? null;
      if (cachedEtag || cachedLastModified) {
        console.log(`Using cached headers — ETag: ${cachedEtag ?? 'none'}, Last-Modified: ${cachedLastModified ?? 'none'}`);
      }
    }
  }

  // 2. Fetch CSV (conditional request)
  const fetchResult = await fetchAcluBills(cachedEtag, cachedLastModified);
  if (fetchResult.unchanged) {
    console.log('Nothing to do — skipping sync.');
    return;
  }
  const { rows: rawRows, etag: newEtag, lastModified: newLastModified } = fetchResult;

  // 2. Normalize
  const bills = [];
  const skipped = [];

  for (const row of rawRows) {
    const stateName  = row['State']?.trim();
    const billRaw    = row['Bill Name']?.trim();
    const stateAbbr  = STATE_ABBR[stateName] ?? null;

    if (!billRaw) { skipped.push(`(empty bill name in ${stateName})`); continue; }
    if (!stateAbbr && stateName) {
      skipped.push(`Unknown state: "${stateName}"`);
      continue;
    }

    const billNumber  = normalizeBillNumber(billRaw);
    const status      = normalizeStatus(row['Status']);
    const statusDetail = row['Status Detail']?.trim() || null;
    const statusDate  = parseDate(row['Status Date']);
    const issues      = normalizeIssues(row['Issues']);

    bills.push({
      state_abbr:     stateAbbr,
      bill_number:    billNumber,
      status,
      status_detail:  statusDetail,
      status_date:    statusDate,
      issues,
      sources:        { aclu: true },
      last_synced_at: new Date().toISOString(),
    });
  }

  // Deduplicate within the fetched data (same bill can appear twice in the CSV)
  const seen = new Set();
  const deduped = bills.filter((b) => {
    const key = `${b.state_abbr ?? ''}|${b.bill_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const dupeCount = bills.length - deduped.length;
  bills.length = 0; bills.push(...deduped);

  console.log(`  ${bills.length} bills normalized, ${skipped.length} skipped${dupeCount ? `, ${dupeCount} intra-CSV duplicates removed` : ''}`);
  if (skipped.length > 0) console.log('  Skipped:', skipped.slice(0, 5).join('; '));
  if (DEBUG) console.log('\nSample normalized bills:', JSON.stringify(bills.slice(0, 3), null, 2));

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No DB writes performed.');
    return;
  }

  // 3. Load existing bills from DB for diffing
  console.log('\nLoading existing bills from DB…');
  const { data: existing, error: fetchErr } = await supabase
    .from('legislation_bills')
    .select('id, state_abbr, bill_number, status');

  if (fetchErr) { console.error('Failed to load existing bills:', fetchErr.message); process.exit(1); }

  const existingMap = new Map(
    (existing ?? []).map((b) => [`${b.state_abbr ?? ''}|${b.bill_number}`, b])
  );

  // 4. Classify: new vs status-changed vs unchanged
  const newBills       = [];
  const changedBills   = [];

  for (const bill of bills) {
    const key      = `${bill.state_abbr ?? ''}|${bill.bill_number}`;
    const existing = existingMap.get(key);
    if (!existing) {
      newBills.push(bill);
    } else if (existing.status !== bill.status) {
      changedBills.push({ ...bill, _prev_status: existing.status, _id: existing.id });
    }
  }

  console.log(`  ${newBills.length} new bills, ${changedBills.length} status changes, ${bills.length - newBills.length - changedBills.length} unchanged`);

  // 5. Upsert all bills
  console.log('\nUpserting bills…');
  const CHUNK = 100;
  let upserted = 0;

  for (let i = 0; i < bills.length; i += CHUNK) {
    const chunk = bills.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('legislation_bills')
      .upsert(chunk, {
        onConflict: 'state_abbr,bill_number',
        ignoreDuplicates: false,  // update status/detail/date on conflict
      });
    if (error) console.warn(`  Upsert error (chunk ${i / CHUNK + 1}):`, error.message);
    else upserted += chunk.length;
  }

  console.log(`  ${upserted} rows upserted`);

  // 6. Verify Trans Legislation Tracker URLs for new bills
  //    (bills already in DB keep their stored tracker_url_status — skip re-checking)
  const billsNeedingVerification = newBills
    .map((b) => ({ bill: b, url: buildTrackerUrl(b.state_abbr, b.bill_number, b.status_date) }))
    .filter((x) => x.url !== null);

  if (billsNeedingVerification.length > 0 && !DRY_RUN) {
    console.log(`\nVerifying ${billsNeedingVerification.length} Trans Legislation Tracker URLs…`);
    const urlStatuses = await verifyTrackerUrls(billsNeedingVerification.map((x) => x.url));

    // Update legislation_bills with results
    const checkedAt = new Date().toISOString();
    for (const { bill, url } of billsNeedingVerification) {
      const status = urlStatuses.has(url) ? urlStatuses.get(url) : null;
      await supabase
        .from('legislation_bills')
        .update({
          tracker_url:            status === 200 ? url : null,
          tracker_url_status:     status ?? null,
          tracker_url_checked_at: checkedAt,
        })
        .eq('state_abbr', bill.state_abbr ?? '')
        .eq('bill_number', bill.bill_number);
    }

    const verified   = [...urlStatuses.values()].filter((s) => s === 200).length;
    const notTracked = [...urlStatuses.values()].filter((s) => s === 404).length;
    const limited    = [...urlStatuses.values()].filter((s) => s === 429 || s === 503).length;
    const errors     = [...urlStatuses.values()].filter((s) => s === 0).length;
    const skipped    = billsNeedingVerification.length - urlStatuses.size;
    console.log(`  Results: ${verified} verified, ${notTracked} not tracked, ${limited} rate limited, ${errors} errors${skipped ? `, ${skipped} skipped (rate limit)` : ''}`);
  }

  // 7. Create digest findings for new and changed bills
  //    Use verified tracker_url from DB where available
  const verifiedUrls = new Map(
    billsNeedingVerification
      .filter(({ url }) => url !== null)
      .map(({ bill, url }) => [
        `${bill.state_abbr ?? ''}|${bill.bill_number}`,
        url,
      ])
  );

  const findings = [];

  // Fetch the digest_run for today, or create one
  let runId = null;
  const { data: todayRun } = await supabase
    .from('digest_runs')
    .select('id')
    .gte('run_at', `${runDate}T00:00:00Z`)
    .order('run_at', { ascending: false })
    .limit(1)
    .single();

  if (todayRun) {
    runId = todayRun.id;
  } else {
    const { data: newRun, error } = await supabase
      .from('digest_runs')
      .insert({ run_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error) console.warn('Could not create digest_run:', error.message);
    else runId = newRun.id;
  }

  for (const bill of newBills) {
    const key        = `${bill.state_abbr ?? ''}|${bill.bill_number}`;
    const trackerUrl = verifiedUrls.get(key) ?? null;
    findings.push({
      digest_run_id:    runId,
      article_url:      `aclu:${bill.state_abbr ?? 'US'}:${bill.bill_number}`,
      article_title:    `New bill: ${bill.state_abbr ?? 'Federal'} ${bill.bill_number}`,
      summary:          `New bill tracked by ACLU. Issues: ${bill.issues.join(', ') || 'unspecified'}. Status: ${bill.status}${bill.status_detail ? ` (${bill.status_detail})` : ''}.`,
      suggested_action: bill.status === 'signed' || bill.status === 'passed'
        ? 'Review for POI severity impact — bill has passed.'
        : 'Monitor for status changes.',
      confidence:       0.95,
      relevance:        bill.status === 'signed' || bill.status === 'passed' ? 'high' : 'medium',
      jurisdiction_type: bill.state_abbr ? 'state' : 'federal',
      legislation_url:  trackerUrl,
    });
  }

  for (const bill of changedBills) {
    const isPassed   = bill.status === 'signed' || bill.status === 'passed';
    // For changed bills, look up tracker_url from DB (already verified from initial sync)
    const { data: billRow } = await supabase
      .from('legislation_bills')
      .select('tracker_url')
      .eq('state_abbr', bill.state_abbr ?? '')
      .eq('bill_number', bill.bill_number)
      .single();
    findings.push({
      digest_run_id:    runId,
      article_url:      `aclu:${bill.state_abbr ?? 'US'}:${bill.bill_number}:${bill.status}`,
      article_title:    `Status change: ${bill.state_abbr ?? 'Federal'} ${bill.bill_number}`,
      summary:          `Status changed from "${bill._prev_status}" to "${bill.status}"${bill.status_detail ? ` (${bill.status_detail})` : ''}.`,
      suggested_action: isPassed
        ? 'Bill has passed — review for POI severity impact.'
        : `Review status change to "${bill.status}".`,
      confidence:       0.98,
      relevance:        isPassed ? 'high' : 'medium',
      jurisdiction_type: bill.state_abbr ? 'state' : 'federal',
      legislation_url:  billRow?.tracker_url ?? null,
    });
  }

  if (findings.length > 0 && runId) {
    console.log(`\nCreating ${findings.length} digest findings…`);
    const { error } = await supabase.from('digest_findings').insert(findings);
    if (error) console.warn('Failed to insert findings:', error.message);
    else console.log('  Done.');

    // Update run totals — store ETag/Last-Modified for next conditional request
    await supabase.from('digest_runs').update({
      findings_count:   findings.length,
      articles_fetched: bills.length,
      attributes:       {
        source:         'aclu_sync',
        new_bills:      newBills.length,
        status_changes: changedBills.length,
        etag:           newEtag,
        last_modified:  newLastModified,
      },
    }).eq('id', runId);
  } else if (findings.length === 0) {
    console.log('\nNo new findings — all bills unchanged.');
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
