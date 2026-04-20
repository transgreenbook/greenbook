#!/usr/bin/env node
/**
 * enrich-catpalm-legislation-urls.mjs
 *
 * Enriches existing CATPALM birth certificate POIs with legislation_url values
 * by looking up bill identifiers in the Open States API.
 *
 * For each CATPALM POI with a recognizable bill identifier in its laws field:
 *   1. Looks up the bill in Open States (using since_date year to pick the right session)
 *   2. Updates legislation_url on the CATPALM policy-rating POI with the state legislature link
 *   3. If the bill has passed/been signed into law:
 *      - Checks whether a law POI already exists (in points_of_interest by source_id)
 *      - If not, creates a new law POI in the law-birth-certificate category
 *
 * Run:
 *   node scripts/enrich-catpalm-legislation-urls.mjs --dry-run   # preview only
 *   node scripts/enrich-catpalm-legislation-urls.mjs              # apply
 *
 * Rate limit: ~10 req/min, 500 req/day (default Open States tier).
 * This script costs ~2 requests per bill found; expect ~20-30 requests total.
 */

import { createClient } from '@supabase/supabase-js';
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

const DRY_RUN         = process.argv.includes('--dry-run');
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENSTATES_API_KEY } = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars'); process.exit(1);
}
if (!OPENSTATES_API_KEY) {
  console.error('Missing OPENSTATES_API_KEY in .env.local');
  console.error('Register at: https://open.pluralpolicy.com/accounts/profile/');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Bill identifier detection
// ---------------------------------------------------------------------------

// Patterns for real legislative bill identifiers (chamber prefix + number).
// Extended to include single-letter prefixes like "S 478" (NJ Senate bill).
const BILL_PATTERN = /\b(SF|SB|HB|AB|HF|LB|LD|HJR|SJR|SCR|HCR|SCS|HCS|HR|SR|S|H|A)\s+\d+\b/g;

function extractBillId(laws) {
  if (!laws) return null;
  // If primarily a statute citation, look for a bill number after a comma
  if (/§|Code Ann|Rev Stat|Admin\. Code|Admin\. R\.|O\.S\.|CMNI|Guam Code|V\.S\.A\./i.test(laws)) {
    const parts = laws.split(',');
    for (const part of parts) {
      const m = part.match(BILL_PATTERN);
      if (m) return m[0].replace(/\s+/, ' ').trim();
    }
    return null;
  }
  const m = laws.match(BILL_PATTERN);
  return m ? m[0].replace(/\s+/, ' ').trim() : null;
}

// ---------------------------------------------------------------------------
// Open States API
// ---------------------------------------------------------------------------

// Actual limit appears to be ~10 req/min sustained; use 7s gap to stay safe.
let lastRequestAt = 0;
async function apiFetch(urlPath, params = {}) {
  const now  = Date.now();
  const wait = 7000 - (now - lastRequestAt);
  if (wait > 0) {
    process.stdout.write(`    (waiting ${Math.ceil(wait / 1000)}s for rate limit…)\r`);
    await new Promise((r) => setTimeout(r, wait));
    process.stdout.write('                                       \r');
  }
  lastRequestAt = Date.now();

  const url = new URL(`https://v3.openstates.org${urlPath}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    // Arrays append each value as a separate param (e.g. include=sources&include=actions)
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, String(item));
    } else {
      url.searchParams.append(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { headers: { 'X-API-KEY': OPENSTATES_API_KEY } });
  if (res.status === 404) return null;
  if (res.status === 429) throw new Error('Rate limited — wait a minute and retry');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// Passed/signed action patterns
const PASSED_ACTIONS = /signed by governor|chaptered|enacted|became law|signed into law|chapter \d+|signed|override prevailed|veto.*prevailed|overridden/i;

// Keywords expected in a bill title OR subject tags related to gender/vital records/birth certs.
// If neither the title nor any subject contains these, flag as a likely wrong match.
const RELEVANT_KEYWORDS = /birth.cert|vital.record|sex.marker|gender.marker|gender.designat|gender.identity|sex.designat|biological sex|transgender|gender.recogni|women.bill|vital.statistic|sex.*identif|identif.*sex|change.*identif/i;

/**
 * Look up a bill by state + identifier + approximate year.
 * Returns { url, title, session, ocdId, isPassed } or null.
 */
async function findBill(abbr, billId, sinceYear) {
  const data = await apiFetch('/bills', {
    jurisdiction: abbr.toLowerCase(),
    identifier:   billId,
    per_page:     10,
  });
  if (!data?.results?.length) return null;

  // Pick the session whose years are closest to sinceYear
  let best = null;
  let bestDiff = Infinity;
  for (const b of data.results) {
    const sessionYears = (b.session ?? '').match(/\d{4}/g)?.map(Number) ?? [];
    if (sinceYear && sessionYears.length) {
      const diff = Math.min(...sessionYears.map((y) => Math.abs(y - sinceYear)));
      if (diff < bestDiff) { bestDiff = diff; best = b; }
    } else if (!best) {
      best = b;
    }
  }
  if (!best) return null;

  // Fetch full detail for source URL and actions
  const ocdId  = best.id.replace('ocd-bill/', '');
  const detail = await apiFetch(`/bills/ocd-bill/${ocdId}`, { include: ['sources', 'actions'] });
  if (!detail) return null;

  const sourceUrl = detail.sources?.[0]?.url ?? null;
  const isPassed  = detail.actions?.some((a) => PASSED_ACTIONS.test(a.description)) ?? false;

  // Check title AND subject tags for relevance
  const subjectText   = (best.subject ?? []).join(' ');
  const titleRelevant = RELEVANT_KEYWORDS.test(best.title ?? '') || RELEVANT_KEYWORDS.test(subjectText);

  return {
    url:           sourceUrl,
    title:         best.title,
    subjects:      best.subject ?? [],
    session:       best.session,
    ocdId:         best.id,
    isPassed,
    titleRelevant,
    latestAction:  best.latest_action_description,
    latestDate:    best.latest_action_date,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made.\n');

  // Load state centroids for creating law POI geom
  const centroidsPath = path.resolve(ROOT, 'public', 'state-centroids.geojson');
  const centroidGeo   = JSON.parse(fs.readFileSync(centroidsPath, 'utf8'));
  const centroidMap   = new Map();
  for (const f of centroidGeo.features) {
    centroidMap.set(f.properties.STUSPS, {
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    });
  }
  const TERRITORY_FALLBACK = {
    GU: { lat:  13.4443, lng: 144.7937 },
    VI: { lat:  18.3358, lng: -64.8963 },
    MP: { lat:  15.0979, lng: 145.6739 },
    AS: { lat: -14.2710, lng: -170.1322 },
  };

  // Load all CATPALM POIs
  const { data: pois, error } = await supabase
    .from('points_of_interest')
    .select('id, title, severity, legislation_url, attributes, source_id')
    .eq('source', 'catpalm')
    .like('source_id', 'catpalm-bc-%')
    .order('title');

  if (error) { console.error('DB error:', error.message); process.exit(1); }
  console.log(`Loaded ${pois.length} CATPALM birth cert POIs.\n`);

  // Load law-birth-certificate category id
  const { data: lawCat } = await supabase
    .from('categories')
    .select('id')
    .eq('icon_slug', 'law-birth-certificate')
    .single();
  const lawCategoryId = lawCat?.id ?? null;

  const counters = {
    looked_up: 0, found: 0, url_updated: 0, already_set: 0,
    law_poi_created: 0, law_poi_exists: 0, not_found: 0, no_bill: 0, failed: 0,
  };

  for (const poi of pois) {
    const abbr      = poi.attributes?.state_abbr;
    const laws      = poi.attributes?.catpalm_laws;
    const stateName = poi.title?.replace(' Birth Certificate Gender Marker Policy', '') ?? abbr;
    const since     = poi.attributes?.since_date;
    const sinceYear = since ? parseInt(since.slice(0, 4)) : null;

    const billId = extractBillId(laws);
    if (!billId) {
      console.log(`  skip  ${(abbr ?? '??').padEnd(3)} — no bill ID in: ${laws?.slice(0, 55) ?? 'null'}`);
      counters.no_bill++;
      continue;
    }

    if (poi.legislation_url) {
      console.log(`  skip  ${abbr} ${billId} — legislation_url already set`);
      counters.already_set++;
      continue;
    }

    console.log(`  lookup ${abbr} ${billId} (since ${sinceYear ?? '?'})…`);
    counters.looked_up++;

    let result;
    try {
      result = await findBill(abbr, billId, sinceYear);
    } catch (err) {
      console.warn(`    FAIL: ${err.message}`);
      counters.failed++;
      continue;
    }

    if (!result) {
      console.log(`    not found in Open States`);
      counters.not_found++;
      continue;
    }

    counters.found++;
    console.log(`    url:     ${result.url ?? '(none)'}`);
    console.log(`    title:   ${result.title?.slice(0, 75)}`);
    if (result.subjects?.length) console.log(`    subject: ${result.subjects.slice(0, 4).join(', ')}`);
    console.log(`    passed:  ${result.isPassed ? 'YES' : 'no'} — ${result.latestAction ?? ''}`);
    if (!result.titleRelevant) {
      console.log(`    WARNING: title doesn't look like a birth cert / gender bill — skipping law POI creation`);
    }

    // 1. Update legislation_url on the CATPALM policy-rating POI
    if (result.url && !DRY_RUN) {
      const { error: urlErr } = await supabase
        .from('points_of_interest')
        .update({ legislation_url: result.url })
        .eq('id', poi.id);
      if (urlErr) console.warn(`    FAIL updating legislation_url: ${urlErr.message}`);
      else counters.url_updated++;
    } else if (result.url) {
      counters.url_updated++;
    }

    // 2. If the bill passed AND the title looks relevant, check for / create a law POI
    if (!result.isPassed || !result.titleRelevant) continue;

    const lawSourceId = `openstates-${result.ocdId}`;

    // Check if a law POI already exists for this bill
    const { data: existing } = await supabase
      .from('points_of_interest')
      .select('id, title')
      .eq('source_id', lawSourceId)
      .maybeSingle();

    if (existing) {
      console.log(`    law POI already exists: "${existing.title}" (id=${existing.id})`);
      counters.law_poi_exists++;
      continue;
    }

    // Also check legislation_bills table
    const { data: existingBill } = await supabase
      .from('legislation_bills')
      .select('id, title')
      .eq('state_abbr', abbr)
      .ilike('bill_number', billId)
      .maybeSingle();

    if (existingBill) {
      console.log(`    bill in legislation_bills: "${existingBill.title}" (id=${existingBill.id})`);
      counters.law_poi_exists++;
      continue;
    }

    // Create a new law POI
    const coords = centroidMap.get(abbr) ?? TERRITORY_FALLBACK[abbr];
    if (!coords) { console.warn(`    no centroid for ${abbr}, skipping law POI`); continue; }

    const lawRecord = {
      title:             `${stateName} — ${billId} (Birth Certificate)`,
      description:       result.title,
      geom:              `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
      severity:          poi.severity,
      is_verified:       false,        // needs admin review before going live
      effect_scope:      'state',
      category_id:       lawCategoryId,
      is_user_submitted: false,
      source:            'openstates',
      source_id:         lawSourceId,
      legislation_url:   result.url,
      website_url:       result.url,
      attributes: {
        state_abbr:      abbr,
        bill_number:     billId,
        session:         result.session,
        latest_action:   result.latestAction,
        latest_date:     result.latestDate,
        openstates_id:   result.ocdId,
      },
    };

    console.log(`    creating law POI: "${lawRecord.title}" (is_verified=false)`);
    if (!DRY_RUN) {
      const { error: insertErr } = await supabase.from('points_of_interest').insert(lawRecord);
      if (insertErr) { console.warn(`    FAIL insert: ${insertErr.message}`); counters.failed++; }
      else counters.law_poi_created++;
    } else {
      counters.law_poi_created++;
    }
  }

  console.log(`
Done.
  Looked up:         ${counters.looked_up}
  Found in OS:       ${counters.found}
  legislation_url:   ${counters.url_updated} updated
  No bill ID:        ${counters.no_bill}
  Not found in OS:   ${counters.not_found}
  Already set:       ${counters.already_set}
  Law POIs created:  ${counters.law_poi_created}
  Law POIs existed:  ${counters.law_poi_exists}
  Failed:            ${counters.failed}
`);
}

main().catch((err) => {
  console.error('Error:', err?.message ?? err);
  process.exit(1);
});
