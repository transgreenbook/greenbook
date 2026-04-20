#!/usr/bin/env node
/**
 * import-catpalm-nonbinary.mjs
 *
 * Imports non-binary gender recognition policy ratings from
 * Transitics' CATPALM 2.0 dataset. Creates one state-scoped
 * policy-rating POI per jurisdiction (56 total).
 * Upserts on source_id so re-runs are safe.
 *
 * Severity scale:
 *   Most Progressive → +3   (X marker recognised on IDs and vital records)
 *   Progressive      → +1   (X marker recognised on IDs only)
 *   Neutral          →  0   (not recognised, no active ban)
 *   Most Restrictive → -3   (actively bans recognition of X markers)
 *
 * Note: this dataset has no 2yr Risk, Since, or Change Since 2024 columns.
 *
 * Run:
 *   node scripts/import-catpalm-nonbinary.mjs --dry-run
 *   node scripts/import-catpalm-nonbinary.mjs
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

const DRY_RUN       = process.argv.includes('--dry-run');
const SOURCE        = 'catpalm';
const CATEGORY_SLUG = 'policy-rating-nonbinary';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Severity map
// ---------------------------------------------------------------------------

const SEVERITY = {
  'Most Progressive':  3,
  'Progressive':       1,
  'Neutral':           0,
  'Most Restrictive': -3,
};

// ---------------------------------------------------------------------------
// Fallback centroids for territories
// ---------------------------------------------------------------------------

const TERRITORY_FALLBACK = {
  GU: { lat:  13.4443, lng: 144.7937 },
  VI: { lat:  18.3358, lng: -64.8963 },
  MP: { lat:  15.0979, lng: 145.6739 },
  AS: { lat: -14.2710, lng: -170.1322 },
};

// ---------------------------------------------------------------------------
// Dataset (all 56 US jurisdictions) — source data as of 2026-04-19
// ---------------------------------------------------------------------------

const CATPALM_DATA_AS_OF = '2026-04-19';
const SOURCE_URL = 'https://transitics.substack.com/p/transitics-comprehensive-anti-trans-586';

const DATA = [
  { state: 'Alabama',                  abbr: 'AL', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'SB 79',                                                                                                                                                                         litigation: 'Not Challenged' },
  { state: 'Alaska',                   abbr: 'AK', rating: 'Neutral',          status: 'Not Recognised',                  laws: "Alaska DMV Certification For Change of Sex Designation on Driver's License or Identification Card, Alaska Health Analytics & Vital Records Gender Marker Change Policy",         litigation: 'Not Challenged' },
  { state: 'Arizona',                  abbr: 'AZ', rating: 'Progressive',      status: 'Recognised on IDs Only',          laws: 'Unofficial Policy, 9 A.A.C. § 19 R9-19-208 (O)',                                                                                                                                litigation: 'Not Challenged' },
  { state: 'Arkansas',                 abbr: 'AR', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'HB 1796',                                                                                                                                                                       litigation: 'Policy Upheld By Arkansas Supreme Court' },
  { state: 'California',               abbr: 'CA', rating: 'Most Progressive', status: 'Recognised',                     laws: 'California DMV Gender Identity Policy, SB 179',                                                                                                                                 litigation: 'Not Challenged' },
  { state: 'Colorado',                 abbr: 'CO', rating: 'Most Progressive', status: 'Recognised',                     laws: 'Colorado DMV Change of Sex Designation Form, Vital Statistics Rule 5, Code of Colorado Regulations 1006-1',                                                                      litigation: 'Not Challenged' },
  { state: 'Connecticut',              abbr: 'CT', rating: 'Most Progressive', status: 'Recognised',                     laws: "Connecticut DMV Gender Designation Form, Connecticut Department of Public Health Affadavit for Amending Sex on Birth Certificate",                                                litigation: 'Not Challenged' },
  { state: 'Delaware',                 abbr: 'DE', rating: 'Progressive',      status: 'Recognised on IDs Only',          laws: "Delaware DMV Request for Gender X Form, Requester's Affidavit for Sex Change on Birth Certificate",                                                                              litigation: 'Not Challenged' },
  { state: 'Florida',                  abbr: 'FL', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: "Florida HSMV Memo (1.24.2024), 'State denies updated birth certificates for transgender Floridians'",                                                                            litigation: 'Not Challenged' },
  { state: 'Georgia',                  abbr: 'GA', rating: 'Neutral',          status: 'Not Recognised',                  laws: 'GA Code § 31-10-23',                                                                                                                                                            litigation: 'Not Challenged' },
  { state: 'Hawaii',                   abbr: 'HI', rating: 'Progressive',      status: 'Recognised on IDs Only',          laws: 'HB 1165, SB 812 (Dead)',                                                                                                                                                        litigation: 'Not Challenged' },
  { state: 'Idaho',                    abbr: 'ID', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'HB 421',                                                                                                                                                                        litigation: 'Not Challenged' },
  { state: 'Illinois',                 abbr: 'IL', rating: 'Most Progressive', status: 'Recognised',                     laws: "Illinois Driver's License Gender Designation Change Form, HB 9",                                                                                                                 litigation: 'Not Challenged' },
  { state: 'Indiana',                  abbr: 'IN', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'EO 25-36',                                                                                                                                                                      litigation: 'Challenge Filed' },
  { state: 'Iowa',                     abbr: 'IA', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'SF 418',                                                                                                                                                                        litigation: 'Not Challenged' },
  { state: 'Kansas',                   abbr: 'KS', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'SB 180',                                                                                                                                                                        litigation: 'Not Challenged' },
  { state: 'Kentucky',                 abbr: 'KY', rating: 'Neutral',          status: 'Not Recognised',                  laws: 'KY Rev Stat § 213.121',                                                                                                                                                         litigation: 'Not Challenged' },
  { state: 'Louisiana',                abbr: 'LA', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'LA Rev Stat § 9:58, LA Rev Stat § 9:59',                                                                                                                                        litigation: 'Not Challenged' },
  { state: 'Maine',                    abbr: 'ME', rating: 'Most Progressive', status: 'Recognised',                     laws: 'HP 1434, Maine Vital Records Gender Marker Policy',                                                                                                                               litigation: 'Not Challenged' },
  { state: 'Maryland',                 abbr: 'MD', rating: 'Progressive',      status: 'Recognised on IDs Only',          laws: 'HB 421, Maryland Division of Vital Records Sex Change Policy',                                                                                                                   litigation: 'Not Challenged' },
  { state: 'Massachusetts',            abbr: 'MA', rating: 'Most Progressive', status: 'Recognised',                     laws: 'Massachusetts Registry of Motor Vehicles Information Change Policy, Massachusetts Registry of Vital Records and Statistics Sex Change Policy',                                    litigation: 'Not Challenged' },
  { state: 'Michigan',                 abbr: 'MI', rating: 'Most Progressive', status: 'Recognised',                     laws: 'Michigan Department of State Sex Designation Policy, Michigan Vital Records and Statistics Sex Designation Form',                                                                  litigation: 'Not Challenged' },
  { state: 'Minnesota',                abbr: 'MN', rating: 'Progressive',      status: 'Recognised on IDs Only',          laws: "Minnesota Driver's License/Instruction Permit/Identification Card Application",                                                                                                  litigation: 'Not Challenged' },
  { state: 'Mississippi',              abbr: 'MS', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'MS Code § 1-3-83',                                                                                                                                                              litigation: 'Not Challenged' },
  { state: 'Missouri',                 abbr: 'MO', rating: 'Neutral',          status: 'Not Recognised',                  laws: 'Missouri Department of Revenue Mail-in Driver License Application',                                                                                                              litigation: 'Not Challenged' },
  { state: 'Montana',                  abbr: 'MT', rating: 'Progressive',      status: 'Recognition on IDs Mandated',     laws: 'SB 458',                                                                                                                                                                        litigation: 'Recognition Mandated By Montana District Court' },
  { state: 'Nebraska',                 abbr: 'NE', rating: 'Neutral',          status: 'Not Recognised',                  laws: 'Nebraska Department of Motor Vehicles Certification of Sex Reassignment Policy',                                                                                                 litigation: 'Not Challenged' },
  { state: 'Nevada',                   abbr: 'NV', rating: 'Most Progressive', status: 'Recognised',                     laws: 'Nevada Department of Motor Vehicles Application For Driving Privileges or ID Card, NV Admin. Codes § 483.070',                                                                   litigation: 'Not Challenged' },
  { state: 'New Hampshire',            abbr: 'NH', rating: 'Most Progressive', status: 'Recognised on IDs Only',          laws: "New Hampshire Division of Motor Vehicles Application For Driver's License or Non-Driver ID Card, NH RSA 5-C:87",                                                                litigation: 'Not Challenged' },
  { state: 'New Jersey',               abbr: 'NJ', rating: 'Most Progressive', status: 'Recognised',                     laws: 'New Jersey Transgender Information Hub Gender Marker Policy Information, S 478',                                                                                                  litigation: 'Not Challenged' },
  { state: 'New Mexico',               abbr: 'NM', rating: 'Most Progressive', status: 'Recognised',                     laws: 'New Mexico Motor Vehicle Division Request For Sex Designation Change, SB 20',                                                                                                     litigation: 'Not Challenged' },
  { state: 'New York',                 abbr: 'NY', rating: 'Most Progressive', status: 'Recognised',                     laws: 'New York Vital Records Gender Designation Amendments Policy, New York City Gender Marker Corrections Policy, S 4402--B',                                                          litigation: 'Not Challenged' },
  { state: 'North Carolina',           abbr: 'NC', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'HB 805',                                                                                                                                                                        litigation: 'Not Challenged' },
  { state: 'North Dakota',             abbr: 'ND', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'HB 1474',                                                                                                                                                                       litigation: 'Not Challenged' },
  { state: 'Ohio',                     abbr: 'OH', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'HB 96',                                                                                                                                                                         litigation: 'Not Challenged' },
  { state: 'Oklahoma',                 abbr: 'OK', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'SB 1100',                                                                                                                                                                       litigation: 'Not Challenged' },
  { state: 'Oregon',                   abbr: 'OR', rating: 'Most Progressive', status: 'Recognised',                     laws: 'Oregon Driver & Motor Vehicle Services Gender Marker Policy, Oregon Center for Health Statistics Gender Marker Policy',                                                           litigation: 'Not Challenged' },
  { state: 'Pennsylvania',             abbr: 'PA', rating: 'Progressive',      status: 'Recognised on IDs Only',          laws: 'Pennsylvania Department of Motor Vehicles Gender Designation Policy, Pennsylvania Vital Records Forms',                                                                          litigation: 'Not Challenged' },
  { state: 'Rhode Island',             abbr: 'RI', rating: 'Most Progressive', status: 'Recognised',                     laws: 'Rhode Island Division of Motor Vehicles Gender Designation Policy, Rhode Island Office of Vital Records Requirements and Fees for Changes to Birth, Marriage, or Death Records', litigation: 'Not Challenged' },
  { state: 'South Carolina',           abbr: 'SC', rating: 'Neutral',          status: 'Not Recognised',                  laws: 'South Carolina Department of Motor Vehicles Form 447-NC',                                                                                                                        litigation: 'Not Challenged' },
  { state: 'South Dakota',             abbr: 'SD', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'SB 1184',                                                                                                                                                                       litigation: 'Not Challenged' },
  { state: 'Tennessee',                abbr: 'TN', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'SB 1440, TN Code § 55-50-321, TN Code § 68-3-203',                                                                                                                              litigation: 'Not Challenged' },
  { state: 'Texas',                    abbr: 'TX', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'HB 229',                                                                                                                                                                        litigation: 'Not Challenged' },
  { state: 'Utah',                     abbr: 'UT', rating: 'Most Progressive', status: 'Recognised',                     laws: 'Utah Courts Petition for Name or Sex Change Form',                                                                                                                               litigation: 'Not Challenged' },
  { state: 'Vermont',                  abbr: 'VT', rating: 'Most Progressive', status: 'Recognised',                     laws: "Vermont Department of Motor Vehicles Application for License/Permit, 8 V.S.A. § 5112, Vermont Affadavit of Gender Identity",                                                    litigation: 'Not Challenged' },
  { state: 'Virginia',                 abbr: 'VA', rating: 'Progressive',      status: 'Recognised on IDs Only',          laws: 'Virginia Department of Motor Vehicles Sex Designation Change Policy, Virginia Vital Records Gender Transition Policy',                                                           litigation: 'Not Challenged' },
  { state: 'Washington',               abbr: 'WA', rating: 'Most Progressive', status: 'Recognised',                     laws: 'Washington State Department of Licensing Gender Designation Change Policy, WAC 246-490-075, Washington Vital Records Sex Designation Change Policy',                              litigation: 'Not Challenged' },
  { state: 'West Virginia',            abbr: 'WV', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'West Virginia Division of Motor Vehicles Gender Designation Form, West Virginia Health Statistics Center Certificate Amendment Policy, SB 456',                                  litigation: 'Not Challenged' },
  { state: 'Wisconsin',                abbr: 'WI', rating: 'Neutral',          status: 'Not Recognised',                  laws: 'Wisconsin Circuit Court System Petition For Gender Change Form',                                                                                                                  litigation: 'Not Challenged' },
  { state: 'Wyoming',                  abbr: 'WY', rating: 'Most Restrictive', status: 'Bans Recognition',               laws: 'HB 32',                                                                                                                                                                         litigation: 'Not Challenged' },
  { state: 'District of Columbia',     abbr: 'DC', rating: 'Most Progressive', status: 'Recognised',                     laws: 'Washington DC Department of Motor Vehicles Gender Designation Change Policy, DC Health Gender Designation Application',                                                           litigation: 'Not Challenged' },
  { state: 'Puerto Rico',              abbr: 'PR', rating: 'Most Progressive', status: 'Recognition Mandated',            laws: 'Ínaru Nadia de la Fuente Díaz v. Jenniffer González Cólon',                                                                                                                    litigation: 'Recognition Mandated By Puerto Rico US District Court' },
  { state: 'U.S. Virgin Islands',      abbr: 'VI', rating: 'Neutral',          status: 'Recognised on Some IDs Only',     laws: "US Virgin Islands Bureau of Motor Vehicles Limited Purpose Driver's License Application, US Virgin Islands Bureau of Motor Vehicles Real ID Driver's License Application",       litigation: 'Not Challenged' },
  { state: 'Guam',                     abbr: 'GU', rating: 'Neutral',          status: 'Not Recognised',                  laws: "Guam Department of Revenue and Taxation Driver's License and Identification Card Application, 10 Guam Code Ann § 3222",                                                         litigation: 'Not Challenged' },
  { state: 'Northern Mariana Islands', abbr: 'MP', rating: 'Neutral',          status: 'Not Recognised',                  laws: "1 CMNI Code § 26018, Commonwealth of the Northern Mariana Islands Bureau of Motor Vehicles Operator's Identification Card Form",                                                 litigation: 'Not Challenged' },
  { state: 'American Samoa',           abbr: 'AS', rating: 'Neutral',          status: 'Not Recognised',                  laws: 'AS Code Ann § 13.0517, AS Code Ann § 13.0530',                                                                                                                                  litigation: 'Not Challenged' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made.\n');

  const centroidsPath = path.resolve(ROOT, 'public', 'state-centroids.geojson');
  const centroids     = JSON.parse(fs.readFileSync(centroidsPath, 'utf8'));
  const centroidMap   = new Map();
  for (const f of centroids.features) {
    centroidMap.set(f.properties.STUSPS, {
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    });
  }
  console.log(`Loaded ${centroidMap.size} state centroids.`);

  let categoryId;
  const { data: existingCat } = await supabase
    .from('categories')
    .select('id')
    .eq('icon_slug', CATEGORY_SLUG)
    .single();

  if (existingCat) {
    categoryId = existingCat.id;
    console.log(`Category "${CATEGORY_SLUG}" found (id=${categoryId}).`);
  } else if (!DRY_RUN) {
    const { data: newCat, error } = await supabase
      .from('categories')
      .insert({
        name:            'Policy Rating — Non-Binary Recognition',
        icon_slug:       CATEGORY_SLUG,
        color:           '#8b5cf6',
        map_visible:     false,
        severity_weight: 50,
      })
      .select('id')
      .single();
    if (error) { console.error('Failed to create category:', error.message); process.exit(1); }
    categoryId = newCat.id;
    console.log(`Category "${CATEGORY_SLUG}" created (id=${categoryId}).`);
  } else {
    console.log(`[dry-run] Would create category "${CATEGORY_SLUG}" (severity_weight=50).`);
    categoryId = 0;
  }

  const { data: existing } = await supabase
    .from('points_of_interest')
    .select('id, source_id')
    .eq('source', SOURCE)
    .like('source_id', 'catpalm-nb-%');
  const existingMap = new Map((existing ?? []).map((r) => [r.source_id, r.id]));
  console.log(`${existingMap.size} existing non-binary POIs in DB.\n`);

  const counters = { inserted: 0, updated: 0, skipped: 0, failed: 0 };

  for (const entry of DATA) {
    const severity = SEVERITY[entry.rating];
    if (severity === undefined) {
      console.warn(`  SKIP ${entry.abbr}: unknown rating "${entry.rating}"`);
      counters.skipped++;
      continue;
    }

    const coords = centroidMap.get(entry.abbr) ?? TERRITORY_FALLBACK[entry.abbr];
    if (!coords) {
      console.warn(`  SKIP ${entry.abbr}: no centroid found`);
      counters.skipped++;
      continue;
    }

    const sourceId = `catpalm-nb-${entry.abbr.toLowerCase()}`;

    const lines = [entry.status];
    if (entry.laws) lines.push(`\nLaw/Policy: ${entry.laws}`);
    if (entry.litigation && entry.litigation !== 'Not Challenged') {
      lines.push(`Litigation: ${entry.litigation}`);
    }
    const description = lines.join('\n');

    const record = {
      title:             `${entry.abbr} Non-Binary Gender Recognition Policy`,
      description,
      long_description:  null,
      geom:              `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
      tags:              ['non-binary', 'gender-marker', 'x-marker', 'policy'],
      severity,
      is_verified:       true,
      effect_scope:      'state',
      category_id:       categoryId,
      is_user_submitted: false,
      source:            SOURCE,
      source_id:         sourceId,
      website_url:       SOURCE_URL,
      source_date:       CATPALM_DATA_AS_OF,
      attributes: {
        state_abbr:         entry.abbr,
        catpalm_rating:     entry.rating,
        catpalm_status:     entry.status,
        catpalm_laws:       entry.laws || null,
        catpalm_litigation: entry.litigation || null,
        catpalm_data_as_of: CATPALM_DATA_AS_OF,
        source_url:         SOURCE_URL,
      },
    };

    if (DRY_RUN) {
      const action = existingMap.has(sourceId) ? 'UPDATE' : 'INSERT';
      console.log(`  [dry] ${action} ${sourceId}  severity=${severity}  (${entry.rating})`);
      console.log(`        ${entry.state}: ${entry.status}`);
      continue;
    }

    const existingId = existingMap.get(sourceId);
    if (existingId) {
      const { error } = await supabase.from('points_of_interest').update(record).eq('id', existingId);
      if (error) { console.warn(`  FAIL update ${sourceId}: ${error.message}`); counters.failed++; }
      else { console.log(`  updated ${sourceId}  severity=${severity}`); counters.updated++; }
    } else {
      const { error } = await supabase.from('points_of_interest').insert(record);
      if (error) { console.warn(`  FAIL insert ${sourceId}: ${error.message}`); counters.failed++; }
      else { console.log(`  inserted ${sourceId}  severity=${severity}`); counters.inserted++; }
    }
  }

  console.log(`\nDone. inserted=${counters.inserted}  updated=${counters.updated}  skipped=${counters.skipped}  failed=${counters.failed}`);
}

main().catch((err) => {
  console.error('Import failed:', err?.message ?? err);
  process.exit(1);
});
