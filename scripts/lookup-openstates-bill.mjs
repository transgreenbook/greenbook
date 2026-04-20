#!/usr/bin/env node
/**
 * lookup-openstates-bill.mjs
 *
 * Utility for looking up state bills via the Open States API v3.
 * Useful for enriching legislation POIs with full titles, sponsors, and links.
 *
 * Usage:
 *   # Look up a specific bill by state + identifier
 *   node scripts/lookup-openstates-bill.mjs --state ia --bill "SF 418"
 *   node scripts/lookup-openstates-bill.mjs --state id --bill "HB 509"
 *
 *   # Search bills by keyword across all states (or one state)
 *   node scripts/lookup-openstates-bill.mjs --query "transgender birth certificate"
 *   node scripts/lookup-openstates-bill.mjs --query "gender marker" --state fl
 *
 * Requires OPENSTATES_API_KEY in .env.local
 *
 * Rate limits (default tier): 500 requests/day, 1 request/sec.
 * Use for admin lookups only — not bulk processing.
 * To increase limits, upgrade at https://open.pluralpolicy.com/accounts/profile/
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

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

const API_KEY = process.env.OPENSTATES_API_KEY;
if (!API_KEY) {
  console.error('Missing OPENSTATES_API_KEY in .env.local');
  console.error('Register at: https://open.pluralpolicy.com/accounts/login/');
  process.exit(1);
}

const BASE_URL = 'https://v3.openstates.org';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

const state = getArg('--state');   // e.g. "ia", "id", "fl"
const bill  = getArg('--bill');    // e.g. "SF 418", "HB 509"
const query = getArg('--query');   // keyword search

if (!bill && !query) {
  console.error('Usage:');
  console.error('  node scripts/lookup-openstates-bill.mjs --state ia --bill "SF 418"');
  console.error('  node scripts/lookup-openstates-bill.mjs --query "transgender birth certificate" [--state fl]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

// Rate limit: 1 req/sec, 500 req/day (default tier).
// Use sparingly — this is for admin lookups, not bulk automation.
let lastRequestAt = 0;
async function apiFetch(path, params = {}) {
  const now  = Date.now();
  const wait = 1100 - (now - lastRequestAt); // 1.1s between requests
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { 'X-API-KEY': API_KEY },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatBill(b) {
  const lines = [];
  lines.push(`\n─────────────────────────────────────────`);
  lines.push(`  ${b.identifier}  —  ${b.jurisdiction?.name ?? b.jurisdiction}`);
  lines.push(`  Session: ${b.session}`);
  lines.push(`  Title:   ${b.title}`);

  if (b.classification?.length) {
    lines.push(`  Type:    ${b.classification.join(', ')}`);
  }

  if (b.subject?.length) {
    lines.push(`  Subject: ${b.subject.slice(0, 5).join(', ')}`);
  }

  if (b.abstracts?.length) {
    lines.push(`  Summary: ${b.abstracts[0].abstract.slice(0, 300)}${b.abstracts[0].abstract.length > 300 ? '…' : ''}`);
  }

  if (b.sponsorships?.length) {
    const primary = b.sponsorships.filter((s) => s.primary);
    const sponsors = (primary.length ? primary : b.sponsorships).slice(0, 3);
    lines.push(`  Sponsors: ${sponsors.map((s) => `${s.name} (${s.classification})`).join(', ')}`);
  }

  if (b.latest_action_description) {
    lines.push(`  Latest:  [${b.latest_action_date}] ${b.latest_action_description}`);
  }

  if (b.sources?.length) {
    lines.push(`  Source:  ${b.sources[0].url}`);
  }

  lines.push(`  OS ID:   ${b.id}`);
  lines.push(`─────────────────────────────────────────`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (bill) {
    // Direct bill lookup
    if (!state) {
      console.error('--state is required when looking up a specific bill (e.g. --state ia)');
      process.exit(1);
    }

    console.log(`Looking up ${bill.toUpperCase()} in ${state.toUpperCase()}…`);

    const data = await apiFetch('/bills', {
      jurisdiction: state.toLowerCase(),
      identifier:   bill,
      include:      'abstracts',
    });

    // The /bills endpoint returns paginated results; also try direct path for exact match
    const results = data.results ?? [];
    if (!results.length) {
      console.log(`No results found for "${bill}" in ${state.toUpperCase()}.`);
      console.log('Try searching by keyword: --query "..."');
      return;
    }

    // Fetch full detail (with sponsorships) for each result
    for (const b of results) {
      try {
        const detail = await apiFetch(`/${b.id.replace('ocd-bill/', 'bills/ocd-bill/')}`, {
          include: 'sponsorships,abstracts,sources',
        });
        console.log(formatBill(detail));
      } catch {
        console.log(formatBill(b));
      }
    }

  } else {
    // Keyword search
    console.log(`Searching for "${query}"${state ? ` in ${state.toUpperCase()}` : ' across all states'}…\n`);

    const params = {
      q:              query,
      classification: 'bill',
      include:        'abstracts',
      per_page:       10,
    };
    if (state) params.jurisdiction = state.toLowerCase();

    const data = await apiFetch('/bills', params);
    const results = data.results ?? [];

    if (!results.length) {
      console.log('No results found.');
      return;
    }

    console.log(`${data.pagination?.total_items ?? results.length} total results (showing first ${results.length}):`);
    for (const b of results) {
      console.log(formatBill(b));
    }
  }
}

main().catch((err) => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
