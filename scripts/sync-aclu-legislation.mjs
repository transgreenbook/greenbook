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
// Fetch + parse ACLU CSV
// ---------------------------------------------------------------------------

async function fetchAcluBills() {
  console.log(`Fetching ACLU CSV from ${ACLU_CSV_URL} …`);
  const resp = await fetch(ACLU_CSV_URL, {
    headers: { 'User-Agent': 'TransSafeTravels-Sync/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const rows = parseCsv(text);
  console.log(`  ${rows.length} rows parsed`);
  return rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const runDate = new Date().toISOString().slice(0, 10);
  console.log(`\nACLU Legislation Sync — ${runDate}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  // 1. Fetch CSV
  const rawRows = await fetchAcluBills();

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

  // 6. Create digest findings for new and changed bills
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
    });
  }

  for (const bill of changedBills) {
    const isPassed = bill.status === 'signed' || bill.status === 'passed';
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
    });
  }

  if (findings.length > 0 && runId) {
    console.log(`\nCreating ${findings.length} digest findings…`);
    const { error } = await supabase.from('digest_findings').insert(findings);
    if (error) console.warn('Failed to insert findings:', error.message);
    else console.log('  Done.');

    // Update run totals
    await supabase.from('digest_runs').update({
      findings_count:   findings.length,
      articles_fetched: bills.length,
      attributes:       {
        source: 'aclu_sync',
        new_bills: newBills.length,
        status_changes: changedBills.length,
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
