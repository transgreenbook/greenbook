#!/usr/bin/env node
/**
 * import-catpalm-bathrooms.mjs
 *
 * Imports bathroom access policy ratings from Transitics' CATPALM 2.0 dataset.
 * Creates one state-scoped policy-rating POI per jurisdiction (56 total).
 * Upserts on source_id so re-runs are safe.
 *
 * Severity scale:
 *   Most Progressive  → +3
 *   Neutral           →  0
 *   Restrictive       → -1
 *   Highly Restrictive → -2
 *   Most Restrictive  → -3
 *   Do Not Travel     → -5   (significant jump — CATPALM active travel warning)
 *
 * Run:
 *   node scripts/import-catpalm-bathrooms.mjs --dry-run
 *   node scripts/import-catpalm-bathrooms.mjs
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
const CATEGORY_SLUG = 'policy-rating-bathroom';

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
  'Most Progressive':   3,
  'Neutral':            0,
  'Restrictive':       -1,
  'Highly Restrictive':-2,
  'Most Restrictive':  -3,
  'Do Not Travel':     -5,
};

// ---------------------------------------------------------------------------
// Fallback centroids for territories absent from TIGER state file
// ---------------------------------------------------------------------------

const TERRITORY_FALLBACK = {
  GU: { lat:  13.4443, lng: 144.7937 },
  VI: { lat:  18.3358, lng: -64.8963 },
  MP: { lat:  15.0979, lng: 145.6739 },
  AS: { lat: -14.2710, lng: -170.1322 },
};

// ---------------------------------------------------------------------------
// Dataset (all 56 US jurisdictions) — source data as of 2026-04-18
// ---------------------------------------------------------------------------

const CATPALM_DATA_AS_OF = '2026-04-18';
const SOURCE_URL = 'https://transitics.substack.com/p/transitics-comprehensive-anti-trans-586';

const DATA = [
  { state: 'Alabama',                  abbr: 'AL', rating: 'Highly Restrictive', risk: 'Low',           status: 'Bathroom Ban In Public K-12 Schools & Permits Bans In State & Local Government Buildings; Trans People Not Held Liable If Violated',                                              laws: 'SB 79, HB 322',                                                                                  litigation: 'Not Challenged',                                                                               since: '2025-02-13', change: 'Restrictive → Highly Restrictive' },
  { state: 'Alaska',                   abbr: 'AK', rating: 'Neutral',             risk: 'Low',           status: 'No Restrictions',                                                                                                                                                               laws: '',                                                                                                litigation: 'Not Challenged',                                                                               since: null,         change: null },
  { state: 'Arizona',                  abbr: 'AZ', rating: 'Most Progressive',    risk: 'Moderate',      status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'Arizona Attorney General Stated Policy, AZ Rev Stat § 41-1402, AZ Rev Stat § 41-1442',           litigation: 'Not Challenged',                                                                               since: '2023-06-30', change: null },
  { state: 'Arkansas',                 abbr: 'AR', rating: 'Most Restrictive',    risk: 'Low',           status: 'Bathroom Ban In Public K-12 Schools, Majority State-Funded Domestic Violence Shelters, & State Government Entity Buildings; Trans People Not Held Liable If Violated',          laws: 'HB 1156, SB 486, AR Code § 9-6-102 (6)',                                                          litigation: 'Not Challenged',                                                                               since: '2025-04-22', change: 'Restrictive → Most Restrictive' },
  { state: 'California',               abbr: 'CA', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'CA Civ Code § 51–53',                                                                             litigation: 'Not Challenged',                                                                               since: '2005-09-29', change: null },
  { state: 'Colorado',                 abbr: 'CO', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'C.R.S. § 24-34-601',                                                                              litigation: 'Not Challenged',                                                                               since: '2008-07-01', change: null },
  { state: 'Connecticut',              abbr: 'CT', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'CT Gen Stat § 46a-64',                                                                            litigation: 'Not Challenged',                                                                               since: '2011-10-01', change: null },
  { state: 'Delaware',                 abbr: 'DE', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'DE Code Title 6 Chapter 45',                                                                      litigation: 'Not Challenged',                                                                               since: '2013-06-19', change: null },
  { state: 'Florida',                  abbr: 'FL', rating: 'Do Not Travel',       risk: 'Cannot Worsen', status: 'Bathroom Ban In Public & State-Funded Colleges, Public K-12 Schools, State-Funded Domestic Violence Shelters, & State & Local Government Buildings; Trans People Held Liable If Violated (Misdemeanor, Not Enforced)', laws: 'HB 1521',                                                                                         litigation: 'Challenge Withdrawn',                                                                          since: '2023-07-01', change: null },
  { state: 'Georgia',                  abbr: 'GA', rating: 'Restrictive',         risk: 'Moderate',      status: 'Bathroom Ban During Athletic Events In K-12 Schools & State-Funded Colleges; Trans People Not Held Liable If Violated',                                                         laws: 'SB 1',                                                                                            litigation: 'Not Challenged',                                                                               since: '2025-07-01', change: 'Neutral → Restrictive' },
  { state: 'Hawaii',                   abbr: 'HI', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'HI Rev Stat § 489-2, HI Rev Stat § 489-3',                                                       litigation: 'Not Challenged',                                                                               since: '2006-01-01', change: null },
  { state: 'Idaho',                    abbr: 'ID', rating: 'Do Not Travel',       risk: 'Cannot Worsen', status: 'Bathroom Ban In Public Buildings & Private Businesses; Trans People Imprisoned If Violated (Misdemeanor, Felony; Pending)',                                                      laws: 'HB 752, HB 264, SB 1100',                                                                         litigation: 'SB 1100 Upheld By 9th Appeals Court, Preliminary Injunction Against HB 264 Denied By Idaho US District Court', since: '2026-03-31', change: 'Highly Restrictive → Do Not Travel' },
  { state: 'Illinois',                 abbr: 'IL', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'IL Comp Stat Chapter 775 Article 1–5',                                                            litigation: 'Bathroom Access Protected By Illinois Second Appeals Court',                                   since: '2006-06-01', change: null },
  { state: 'Indiana',                  abbr: 'IN', rating: 'Neutral',             risk: 'High',          status: 'No Restrictions',                                                                                                                                                               laws: '',                                                                                                litigation: 'Not Challenged',                                                                               since: null,         change: null },
  { state: 'Iowa',                     abbr: 'IA', rating: 'Restrictive',         risk: 'Low',           status: 'Bathroom Ban In Public K-12 Schools; Trans People Not Held Liable If Violated',                                                                                                 laws: 'SF 482',                                                                                          litigation: 'Not Challenged',                                                                               since: '2023-03-22', change: null },
  { state: 'Kansas',                   abbr: 'KS', rating: 'Do Not Travel',       risk: 'Cannot Worsen', status: 'Bathroom Ban In All Public Buildings; Trans People Held Liable If Violated (Misdemeanor, Bounty)',                                                                               laws: 'SB 244',                                                                                          litigation: 'Not Challenged',                                                                               since: '2026-02-26', change: 'Restrictive → Do Not Travel' },
  { state: 'Kentucky',                 abbr: 'KY', rating: 'Restrictive',         risk: 'Moderate',      status: 'Bathroom Ban In Public K-12 Schools; Trans People Not Held Liable If Violated',                                                                                                 laws: 'SB 150',                                                                                          litigation: 'Not Challenged',                                                                               since: '2023-03-29', change: null },
  { state: 'Louisiana',                abbr: 'LA', rating: 'Restrictive',         risk: 'Low',           status: 'Bathroom Ban In Public K-12 Schools & State-Run Domestic Violence Shelters; Trans People Not Held Liable If Violated',                                                          laws: 'HB 608',                                                                                          litigation: 'Not Challenged',                                                                               since: '2024-08-01', change: 'Neutral → Restrictive' },
  { state: 'Maine',                    abbr: 'ME', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'ME Rev Stat Title 5 Chapter 337 §4553, ME Rev. Stat. Title 5 Chapter 337 §4591',                 litigation: 'Bathroom Access Protected By Maine Supreme Judicial Court',                                   since: '2014-01-30', change: null },
  { state: 'Maryland',                 abbr: 'MD', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'MD Rev Stat State Government § 20-301 – MD State Government Code § 20-602',                      litigation: 'Not Challenged',                                                                               since: '2014-10-01', change: null },
  { state: 'Massachusetts',            abbr: 'MA', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'MA Gen Laws Chapter 272 § 92A',                                                                   litigation: 'Not Challenged',                                                                               since: '2016-10-01', change: null },
  { state: 'Michigan',                 abbr: 'MI', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'MI Comp Laws § 37.2301, MI Comp. Laws § 37.2302',                                                 litigation: 'Not Challenged',                                                                               since: '2024-02-13', change: 'Neutral → Most Progressive' },
  { state: 'Minnesota',                abbr: 'MN', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'MN Stat § 363A.03, MN Stat § 363A.11, MN Stat § 363A.12',                                        litigation: 'Not Challenged',                                                                               since: '2024-01-01', change: 'Neutral → Most Progressive' },
  { state: 'Mississippi',              abbr: 'MS', rating: 'Most Restrictive',    risk: 'High',          status: 'Bathroom Ban In Public Colleges, Public K-12 Schools, State-Run Domestic Violence Shelters, & State & Local Government Buildings; Trans People Not Held Liable If Violated',    laws: 'SB 2753',                                                                                         litigation: 'Not Challenged',                                                                               since: '2024-05-13', change: 'Neutral → Most Restrictive' },
  { state: 'Missouri',                 abbr: 'MO', rating: 'Neutral',             risk: 'High',          status: 'No Restrictions',                                                                                                                                                               laws: '',                                                                                                litigation: 'Not Challenged',                                                                               since: null,         change: null },
  { state: 'Montana',                  abbr: 'MT', rating: 'Neutral',             risk: 'Low',           status: 'Bathroom Ban In Public Colleges, Public K-12 Schools, State-Funded Domestic Violence Shelters, & All State & Local Government Buildings; Trans People Not Held Liable If Violated (Blocked)', laws: 'HB 121, MT Code Ann § 20-6-803',                                                                  litigation: 'Preliminary Injunction Granted By Missoula County District Court',                             since: '2025-05-16', change: 'Most Restrictive → Neutral' },
  { state: 'Nebraska',                 abbr: 'NE', rating: 'Neutral',             risk: 'Low',           status: 'No Restrictions',                                                                                                                                                               laws: '',                                                                                                litigation: 'Not Challenged',                                                                               since: null,         change: null },
  { state: 'Nevada',                   abbr: 'NV', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'NV Rev Stat § 651.070',                                                                           litigation: 'Not Challenged',                                                                               since: '2011-10-01', change: null },
  { state: 'New Hampshire',            abbr: 'NH', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'HB 148 (Vetoed), NH RSA 354-A:2, NH RSA 354-A:17',                                               litigation: 'Not Challenged',                                                                               since: '2018-07-08', change: null },
  { state: 'New Jersey',               abbr: 'NJ', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'NJ Rev Stat § 10:5-5, NJ Rev Stat § 10:5-12',                                                    litigation: 'Not Challenged',                                                                               since: '2007-06-17', change: null },
  { state: 'New Mexico',               abbr: 'NM', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'NM Stat § 28-1-2, NM Stat § 28-1-7',                                                             litigation: 'Not Challenged',                                                                               since: '2003-07-01', change: null },
  { state: 'New York',                 abbr: 'NY', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'NY Exec Laws § 292, NY Exec Laws § 296',                                                          litigation: 'Not Challenged',                                                                               since: '2019-02-24', change: null },
  { state: 'North Carolina',           abbr: 'NC', rating: 'Neutral',             risk: 'Low',           status: 'No Restrictions',                                                                                                                                                               laws: 'HB 2 (Repealed), HB 142 (Provisions Expired)',                                                    litigation: 'Restrictions Fully Removed By Settlement',                                                     since: '2020-12-01', change: null },
  { state: 'North Dakota',             abbr: 'ND', rating: 'Restrictive',         risk: 'Moderate',      status: 'Bathroom Ban In Public K-12 Schools & Public College Dorms; Trans People Not Held Liable If Violated',                                                                          laws: 'HB 1144, HB 1473',                                                                                litigation: 'Not Challenged',                                                                               since: '2025-05-02', change: null },
  { state: 'Ohio',                     abbr: 'OH', rating: 'Highly Restrictive',  risk: 'Moderate',      status: 'Bathroom Ban In Public K-12 Schools & Public & Private Colleges; Trans People Not Held Liable If Violated',                                                                      laws: 'SB 104',                                                                                          litigation: 'Not Challenged',                                                                               since: '2025-01-01', change: 'Neutral → Highly Restrictive' },
  { state: 'Oklahoma',                 abbr: 'OK', rating: 'Restrictive',         risk: 'Low',           status: 'Bathroom Ban In Public K-12 Schools; Trans People Not Held Liable If Violated',                                                                                                 laws: 'SB 615',                                                                                          litigation: 'Case Dismissed By Western Oklahoma US District Court (Appealed To 10th Appeals Court)',       since: '2022-05-25', change: 'Neutral → Restrictive' },
  { state: 'Oregon',                   abbr: 'OR', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'OR Rev Stat § 659A.400, OR Rev Stat § 659A.403',                                                  litigation: 'Case Dismissed By 9th Appeals Court',                                                         since: '2008-01-01', change: null },
  { state: 'Pennsylvania',             abbr: 'PA', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'Pennsylvania Human Relations Act, Pennsylvania Human Relations Commission Guidance On Discrimination On the Basis of Sex', litigation: 'Challenge Filed',                                                                              since: '2021-03-03', change: null },
  { state: 'Rhode Island',             abbr: 'RI', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'RI Gen Laws § 11-24-2, RI Gen Laws § 11-24-3',                                                   litigation: 'Not Challenged',                                                                               since: '2002-01-01', change: null },
  { state: 'South Carolina',           abbr: 'SC', rating: 'Restrictive',         risk: 'Moderate',      status: 'Bathroom Ban In Public K-12 Schools; Trans People Not Held Liable If Violated',                                                                                                 laws: 'H630 Part 1B Section 1 1.114',                                                                    litigation: 'Challenge Withdrawn',                                                                          since: null,         change: null },
  { state: 'South Dakota',             abbr: 'SD', rating: 'Most Restrictive',    risk: 'Low',           status: 'Bathroom Ban In Public K-12 Schools & All State & Local Government Buildings; Trans People Not Held Liable If Violated',                                                         laws: 'HB 1259',                                                                                         litigation: 'Not Challenged',                                                                               since: '2025-03-31', change: 'Neutral → Most Restrictive' },
  { state: 'Tennessee',                abbr: 'TN', rating: 'Restrictive',         risk: 'Moderate',      status: 'Bathroom Ban In Public K-12 Schools; Trans People Not Held Liable If Violated',                                                                                                 laws: 'HB 1233',                                                                                         litigation: 'Case Dismissed By Middle Tennessee US District Court',                                         since: '2021-07-01', change: null },
  { state: 'Texas',                    abbr: 'TX', rating: 'Most Restrictive',    risk: 'Low',           status: 'Bathroom Ban In Public Colleges, Domestic Violence Shelters, & All State & Local Government Buildings; Trans People Not Held Liable If Violated (Pending)',                      laws: 'SB 8',                                                                                            litigation: 'Not Challenged',                                                                               since: '2025-12-04', change: 'Neutral → Most Restrictive' },
  { state: 'Utah',                     abbr: 'UT', rating: 'Most Restrictive',    risk: 'Low',           status: 'Bathroom Ban In Public Colleges, Public K-12 Schools, & All State & Local Government Buildings; Trans People Held Liable If Violated (Misdemeanor In Changing Rooms Only)',      laws: 'HB 257',                                                                                          litigation: 'Not Challenged',                                                                               since: '2024-01-30', change: 'Neutral → Most Restrictive' },
  { state: 'Vermont',                  abbr: 'VT', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: '9 V.S.A. § 4501, 9 V.S.A. § 4502',                                                               litigation: 'Not Challenged',                                                                               since: '2007-05-22', change: null },
  { state: 'Virginia',                 abbr: 'VA', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'VA Code § 2.2-3904',                                                                              litigation: 'Not Challenged',                                                                               since: '2020-07-01', change: null },
  { state: 'Washington',               abbr: 'WA', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'WA Rev Code § 49.60.040, WA Rev Code § 49.60.215',                                               litigation: 'Not Challenged',                                                                               since: '2006-06-07', change: null },
  { state: 'West Virginia',            abbr: 'WV', rating: 'Highly Restrictive',  risk: 'Low',           status: 'Bathroom Ban In Public Colleges, Public K-12 Schools, & State-Funded Domestic Violence Shelters; Trans People Not Held Liable If Violated',                                     laws: 'SB 456',                                                                                          litigation: 'Not Challenged',                                                                               since: '2025-06-09', change: 'Neutral → Highly Restrictive' },
  { state: 'Wisconsin',                abbr: 'WI', rating: 'Neutral',             risk: 'Moderate',      status: 'No Restrictions',                                                                                                                                                               laws: '',                                                                                                litigation: 'Not Challenged',                                                                               since: null,         change: null },
  { state: 'Wyoming',                  abbr: 'WY', rating: 'Most Restrictive',    risk: 'Low',           status: 'Bathroom Ban In Public K-12 Schools & All State & Local Government Buildings; Trans People Not Held Liable If Violated',                                                         laws: 'HB 72, SF 62',                                                                                    litigation: 'Not Challenged',                                                                               since: '2025-07-01', change: 'Neutral → Most Restrictive' },
  { state: 'District of Columbia',     abbr: 'DC', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: '4 DCMR § 801.1',                                                                                  litigation: 'Not Challenged',                                                                               since: '2006-10-03', change: null },
  { state: 'Puerto Rico',              abbr: 'PR', rating: 'Neutral',             risk: 'Low',           status: 'No Restrictions',                                                                                                                                                               laws: '',                                                                                                litigation: 'Not Challenged',                                                                               since: null,         change: null },
  { state: 'U.S. Virgin Islands',      abbr: 'VI', rating: 'Most Progressive',    risk: 'Low',           status: 'Bathroom Access Protected',                                                                                                                                                     laws: 'Bill 34-0271, 10 V.I.C. § 64, Virgin Islands Attorney General\'s Stated Policy',                  litigation: 'Not Challenged',                                                                               since: '2023-01-19', change: null },
  { state: 'Guam',                     abbr: 'GU', rating: 'Neutral',             risk: 'Low',           status: 'No Restrictions',                                                                                                                                                               laws: '',                                                                                                litigation: 'Not Challenged',                                                                               since: null,         change: null },
  { state: 'Northern Mariana Islands', abbr: 'MP', rating: 'Neutral',             risk: 'Low',           status: 'No Restrictions',                                                                                                                                                               laws: '',                                                                                                litigation: 'Not Challenged',                                                                               since: null,         change: null },
  { state: 'American Samoa',           abbr: 'AS', rating: 'Neutral',             risk: 'Low',           status: 'No Restrictions',                                                                                                                                                               laws: '',                                                                                                litigation: 'Not Challenged',                                                                               since: null,         change: null },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made.\n');

  // Load state centroids
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

  // Ensure category exists
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
        name:            'Policy Rating — Bathroom Access',
        icon_slug:       CATEGORY_SLUG,
        color:           '#f59e0b',
        map_visible:     false,
        severity_weight: 75,
      })
      .select('id')
      .single();
    if (error) { console.error('Failed to create category:', error.message); process.exit(1); }
    categoryId = newCat.id;
    console.log(`Category "${CATEGORY_SLUG}" created (id=${categoryId}).`);
  } else {
    console.log(`[dry-run] Would create category "${CATEGORY_SLUG}" (severity_weight=75).`);
    categoryId = 0;
  }

  // Load existing POIs for upsert tracking
  const { data: existing } = await supabase
    .from('points_of_interest')
    .select('id, source_id')
    .eq('source', SOURCE)
    .like('source_id', 'catpalm-bathroom-%');
  const existingMap = new Map((existing ?? []).map((r) => [r.source_id, r.id]));
  console.log(`${existingMap.size} existing bathroom POIs in DB.\n`);

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

    const sourceId = `catpalm-bathroom-${entry.abbr.toLowerCase()}`;

    // Build description
    const lines = [entry.status];
    if (entry.laws) lines.push(`\nLaw/Policy: ${entry.laws}`);
    if (entry.litigation && entry.litigation !== 'Not Challenged') {
      lines.push(`Litigation: ${entry.litigation}`);
    }
    const description = lines.join('\n');

    const record = {
      title:             `${entry.abbr} Bathroom Access Policy`,
      description,
      long_description:  null,
      geom:              `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
      tags:              ['bathroom', 'facility-access', 'policy'],
      severity,
      is_verified:       true,
      effect_scope:      'state',
      category_id:       categoryId,
      is_user_submitted: false,
      source:            SOURCE,
      source_id:         sourceId,
      website_url:       SOURCE_URL,
      attributes: {
        state_abbr:          entry.abbr,
        catpalm_rating:      entry.rating,
        catpalm_risk:        entry.risk,
        catpalm_status:      entry.status,
        catpalm_laws:        entry.laws || null,
        catpalm_litigation:  entry.litigation || null,
        since_date:          entry.since ?? null,
        change_since_2024:   entry.change ?? null,
        catpalm_data_as_of:  CATPALM_DATA_AS_OF,
        source_url:          SOURCE_URL,
      },
    };

    if (DRY_RUN) {
      const action = existingMap.has(sourceId) ? 'UPDATE' : 'INSERT';
      console.log(`  [dry] ${action} ${sourceId}  severity=${severity}  (${entry.rating})`);
      console.log(`        ${entry.state}: ${entry.status.slice(0, 70)}`);
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
